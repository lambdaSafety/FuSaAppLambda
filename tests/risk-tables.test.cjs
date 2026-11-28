const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../docs/risk-tables.js'),'utf8');
const tables=vm.runInNewContext(source+'\nriskTables');
test('AgPLr Figure 1 across all exposure and controllability classes',()=>{
  const expected=[
    ['----','----','----','----','----'],
    ['----','----','---a','--ab','-abc'],
    ['----','---a','--ab','-abc','-bcd'],
    ['---a','--ab','-abc','-bcd','-cde']
  ];
  expected.forEach((rows,s)=>rows.forEach((row,e)=>Array.from(row).forEach((ch,c)=>{
    assert.equal(tables['risk-agpl'].grade(['S'+s,'E'+e,'C'+c]),ch==='-'?'QM':'AgPLr '+ch);
  })));
});
test('vehicle and motorcycle HARA distinguish zero classes and QM',()=>{
  const matrix=[['---','---','--A','-AB'],['---','--A','-AB','ABC'],['--A','-AB','ABC','BCD']];
  const mapped={QM:'QM',A:'QM',B:'ASIL A',C:'ASIL B',D:'ASIL C'};
  for(let s=0;s<=3;s++)for(let e=0;e<=4;e++)for(let c=0;c<=3;c++){
    const inputs=['S'+s,'E'+e,'C'+c];
    const level=s*e*c?matrix[s-1][e-1][c-1]:null;
    const auto=level==='-'?'QM':'ASIL '+level;
    const moto=level==='-'?'QM → QM':'MSIL '+level+' → '+mapped[level];
    assert.equal(tables.hara.grade(inputs),level?auto:'할당 불필요');
    assert.equal(tables['risk-msil'].grade(inputs),level?moto:'할당 불필요');
  }
});
test('S/F/P and the calibrated IEC example have distinct lookup paths',()=>{
  const pl=tables['risk-pl'].grade;
  const sil=tables['risk-sil'].grade;
  ['ab','bc','cd','de'].forEach((row,i)=>Array.from(row).forEach((v,j)=>{
    assert.equal(pl(['S'+(1+Math.floor(i/2)),'F'+(1+i%2),'P'+(j+1)]),'PLr '+v);
  }));
  assert.equal(sil(['C4','F1','P1','W3']),'추가 위험 저감 필요');
  assert.equal(sil(['C4','F1','P1','W2']),'SIL 4');
  assert.equal(sil(['C1','F2','P2','W1']),'안전 요구 없음');
  assert.equal(sil(['C2','F2','P1','W3']),'SIL 2');
});
test('baseline top-level FDAL',()=>{
  ['No Safety Effect','Minor','Major','Hazardous','Catastrophic'].forEach((v,i)=>{
    assert.equal(tables['risk-dal'].grade([v]),'FDAL '+'EDCBA'[i]);
  });
});
