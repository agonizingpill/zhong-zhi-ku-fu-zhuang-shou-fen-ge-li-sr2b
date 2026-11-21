from fastapi import HTTPException
from sqlalchemy import select
from .models import Lot,Accession,Distribution,GerminationTest
from .common import lock,pack,add,audit,reserve
from . import lineage_service as lineage

def request(s,d,u):
    if not s.get(Lot,d.lot_id):raise HTTPException(404,'种批不存在')
    x=Distribution(**d.model_dump());audit(s,u,'申请种质共享 '+d.code);return add(s,x)
def approve(s,id,u):
    pre=s.get(Distribution,id)
    if not pre:raise HTTPException(404,'共享单不存在')
    lot=s.get(Lot,pre.lot_id)
    # 先锁定谱系来源行，再锁种质父行：核对与签发并发时按锁序决出先后，
    # 先落账者保留结果；重试不会重复核对或重复扣种。
    source=lineage.find(s,lot,locked=True)
    lock(s,Accession,lot.accession_id);d=lock(s,Distribution,id)
    if d.state!='requested':raise HTTPException(409,'共享只能签发一次')
    blocked=lineage.block_reason(s,lot,source)
    if blocked:raise HTTPException(409,blocked)
    test=s.scalar(select(GerminationTest).where(GerminationTest.lot_id==lot.id,GerminationTest.state=='ready').order_by(GerminationTest.id.desc()))
    if not test or test.prediction['observed_pct']<80:raise HTTPException(409,'共享种批须独立复测发芽率≥80%，后代不可只用继承先验')
    d.reserve_snapshot=reserve(s,lot,d.seeds)|{'test':pack(test),'lineage':lineage.snapshot(source) if source else None}
    d.state='approved';audit(s,u,'主管签发种质共享 '+d.code);return pack(d)
def receive(s,id,u):
    d=lock(s,Distribution,id)
    if d.state!='approved':raise HTTPException(409,'只有已签发共享可登记接收，不能重复')
    d.state='received';audit(s,u,'收讫种质共享 '+d.code);return pack(d)
