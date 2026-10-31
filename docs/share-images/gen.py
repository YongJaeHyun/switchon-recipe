import json
INK={1:'#BE123C',2:'#A16207',3:'#4D7C0F',4:'#6D28D9',5:'#171717'}
WEEKS = {1:('#F4758A','#FFF1F3'),2:('#EAB308','#FEF9E7'),3:('#65A30D','#F3F9EA'),4:('#9F7AEA','#F5F0FF'),5:('#262626','#F4F4F5')}
CSS = """
@font-face{font-family:P;src:url(font.ttf);font-weight:100 900}
*{margin:0;box-sizing:border-box}
body{width:800px;height:400px;font-family:P;overflow:hidden;position:relative;background:var(--bg);color:#171717}
.wrap{position:absolute;inset:0;padding:56px 64px;display:flex;flex-direction:column;justify-content:space-between}
.kicker{font-size:24px;font-weight:700;color:var(--ink);letter-spacing:-0.3px}
h1{font-size:88px;font-weight:850;letter-spacing:-3px;line-height:1.05}
.brand{position:absolute;right:56px;top:50px;display:flex;align-items:center;gap:8px;font-size:20px;font-weight:700;color:#166534}
.brand img{width:40px;height:40px;border-radius:20px;background:#fff;padding:2px}
.track{display:flex;gap:10px;width:100%}
.seg{flex:1;display:flex;flex-direction:column;gap:10px}
.bar{height:14px;border-radius:7px;background:#e5e5e5}
.lab{font-size:18px;font-weight:600;color:#a3a3a3}
.on .lab{color:#171717;font-weight:800}
.mark{position:absolute;right:80px;top:130px;width:190px;height:190px;border-radius:95px;display:flex;align-items:center;justify-content:center;font-size:130px;font-weight:900;color:#fff;background:var(--ink)}
"""
def page(body, bg, ink):
    return f"<!doctype html><html><head><meta charset=utf-8><style>{CSS}</style></head><body style='--bg:{bg};--ink:{ink}'>{body}<div class=brand><img src=icon.png>스위치온 레시피</div></body></html>"
def track(cur, colorize_done=True):
    out=[]
    for w in range(1,6):
        c,_=WEEKS[w]
        lab='유지기' if w==5 else f'{w}주차'
        filled = (w<=cur) if cur else False
        bar = f"background:{c}" if filled else ""
        out.append(f"<div class='seg{' on' if w==cur else ''}'><div class=bar style='{bar}'></div><div class=lab>{lab}</div></div>")
    return "<div class=track>"+"".join(out)+"</div>"
files={}
for w in range(1,6):
    c,bg=WEEKS[w]
    title='유지기' if w==5 else f'{w}주차'
    files[f'completion-{w}']=page(f"<div class=wrap><div class=kicker style='color:{INK[w]}'>스위치온 완주 인증</div><h1>{title}</h1>{track(w)}</div>",bg,c)
files['invite']=page(f"<div class=wrap><div class=kicker>스위치온 4주 식단</div><h1>같이 시작할래?</h1>{track(1)}</div>",'#EAF7EE','#16A34A')
def fc(title, mark, bg, c, ink):
    return page(f"<div class=wrap><div class=kicker style='color:{ink}'>스위치온 음식 판정</div><h1>{title}</h1><div></div></div><div class=mark>{mark}</div>",bg,c)
files['foodcheck-ok']=fc('먹어도<br>돼요','✓','#EAF7EE','#16A34A','#15803D')
files['foodcheck-caution']=fc('주의가<br>필요해요','!','#FFFBEB','#F59E0B','#B45309')
files['foodcheck-avoid']=fc('피하는 게<br>좋아요','✕','#FEF2F2','#EF4444','#B91C1C')
for k,v in files.items():
    if k=='invite': v=v.replace('<div class=lab>1주차</div>','<div class=lab>1주차부터</div>')
    open(f'{k}.html','w').write(v)
print(' '.join(files))
