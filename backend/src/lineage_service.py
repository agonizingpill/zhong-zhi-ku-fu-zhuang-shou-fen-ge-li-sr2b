import hashlib,json
from datetime import datetime,timezone
from fastapi import HTTPException
from sqlalchemy import select
from .models import LineageSource,Lot,Plot
from .common import lock,pack,audit

def _version(test,snapshot):
    digest=hashlib.sha256(json.dumps(snapshot or {},sort_keys=True,ensure_ascii=False,default=str).encode()).hexdigest()[:12]
    return ('v1/'+test.code+'/'+digest) if test else ('v1/unlinked/'+digest)

def create(s,harvest,regen,parent,father,pollen,flowering,test):
    plot=s.get(Plot,flowering.plot_id)
    if not plot:raise HTTPException(409,'收获花期缺少隔离小区记录，无法建立谱系来源')
    x=LineageSource(
        harvest_id=harvest.id,offspring_lot_id=harvest.offspring_lot_id,
        mother_lot_id=parent.id,father_lot_id=father.id,
        bag_code=pollen.bag_code,flowering_plot_code=plot.code,
        flowering_start=flowering.start,flowering_end=flowering.end,
        vitality_test_id=test.id if test else None,
        vitality_version=_version(test,regen.vitality_snapshot),
        vitality_snapshot=regen.vitality_snapshot,
        status='pending',revision=1,
        pending_reason='回库后待核对花期、袋签与活力版本抄录')
    s.add(x);s.flush();return x

def snapshot(x):
    return {k:getattr(x,k) for k in ('id','harvest_id','offspring_lot_id','mother_lot_id','father_lot_id','bag_code','flowering_plot_code','flowering_start','flowering_end','vitality_test_id','vitality_version','status','revision','pending_reason')}

def find(s,lot,locked=False):
    q=select(LineageSource).where(LineageSource.offspring_lot_id==lot.id)
    if locked:q=q.with_for_update().execution_options(populate_existing=True)
    return s.scalar(q)

def reason(x):
    return x.pending_reason or '花期、袋签或活力版本待核对'

def block_reason(s,lot,source=None):
    x=source if source is not None else find(s,lot)
    if x:
        return None if x.status=='verified' else '后代种批 '+lot.code+' 的谱系来源待核：'+reason(x)+'；核对通过前不得签发共享'
    if lot.parent_lot_id is not None:
        return '后代种批 '+lot.code+' 缺少谱系来源记录，来源无法核实；核对来源前不得签发共享'
    return None

def _correct(s,x,d):
    changed=[]
    if d.bag_code is not None and d.bag_code!=x.bag_code:x.bag_code=d.bag_code;changed.append('袋签')
    if d.flowering_plot_code is not None and d.flowering_plot_code!=x.flowering_plot_code:
        if not s.scalar(select(Plot).where(Plot.code==d.flowering_plot_code)):raise HTTPException(404,'隔离小区不存在')
        x.flowering_plot_code=d.flowering_plot_code;changed.append('花期小区')
    start=d.flowering_start.isoformat() if d.flowering_start else x.flowering_start
    end=d.flowering_end.isoformat() if d.flowering_end else x.flowering_end
    if end<start:raise HTTPException(409,'花期结束不得早于开始')
    if start!=x.flowering_start or end!=x.flowering_end:
        x.flowering_start=start;x.flowering_end=end;changed.append('花期')
    return changed

def correct(s,id,u,d):
    pre=s.get(LineageSource,id)
    if not pre:raise HTTPException(404,'谱系来源记录不存在')
    x=lock(s,LineageSource,id)
    changed=_correct(s,x,d)
    if not changed:raise HTTPException(409,'没有需要更正的来源字段')
    x.revision+=1;x.status='pending';x.verified_by=None;x.verified_at=None
    x.pending_reason=d.reason or ('来源更正待重核：'+'、'.join(changed))
    audit(s,u,'更正谱系来源 r'+str(x.revision)+' 收获#'+str(x.harvest_id));return pack(x)

def verify(s,id,u,d):
    pre=s.get(LineageSource,id)
    if not pre:raise HTTPException(404,'谱系来源记录不存在')
    # 与共享签发共用同一行锁：先落账的一方保留结果。
    x=lock(s,LineageSource,id)
    changed=_correct(s,x,d)
    if changed:
        x.revision+=1;x.pending_reason=d.reason or ('来源更正待重核：'+'、'.join(changed))
    elif x.status=='verified':
        # 幂等重试：不重复核对、不再次递增版本。
        return pack(x)
    x.status='verified';x.pending_reason='';x.verified_by=u.email
    x.verified_at=datetime.now(timezone.utc).isoformat(timespec='seconds')
    audit(s,u,'主管核对谱系来源 r'+str(x.revision)+' 收获#'+str(x.harvest_id));return pack(x)
