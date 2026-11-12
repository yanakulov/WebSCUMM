"""Draw the native room backgrounds and sprite atlas, then compile with Pixel Art HTML."""
import json
import math
import random
import subprocess
import sys
import tempfile
from pathlib import Path

PALETTE = dict(item.split("=") for item in (
    "ink=090616 void=120d2b blue0=111033 blue1=18194b blue2=232c61 blue3=374581 "
    "blue4=5461a8 blue5=7889c2 sky=3b4384 mist=5057a0 star=a7adee moon=cfc6ef "
    "sea0=090e26 sea1=102241 sea2=183955 sea3=235373 sea4=307a91 foam=62a4ab wave0=40859d wave1=509ab1 wave2=6eafbf wave3=35758e "
    "deep=211727 bark=322334 beam=473039 wood0=533843 wood1=68434a wood2=80534f "
    "wood3=9b6a55 wood4=b68161 roof0=201a3a roof1=2d294d roof2=433c6b roof3=655e9a "
    "stone0=282536 stone1=3b344a stone2=494259 stone3=61536a stone4=73617a "
    "iron0=202430 iron1=3c4153 iron2=555e68 iron3=7b8783 "
    "red0=542637 red1=853c43 red2=a9554d red3=cc7157 "
    "green0=1d3537 green1=2f4c48 green2=4c6555 green3=6f8061 "
    "gold0=77432f gold1=ae683c gold2=d6944c gold3=f3bf65 gold4=ffdc91 flame0=f6b350 flame1=ffe3a4 "
    "paper0=a68c68 paper1=c8af81 paper2=e1c79a skin0=894738 skin1=bc6a50 skin2=e09367 "
    "shirt0=415150 shirt1=607172 shirt2=82958d eye=fff1cb white=e9e0d7"
).split())
PALETTE = {name: "#" + rgb for name, rgb in PALETTE.items()}
rng = random.Random(405)

class Canvas:
    def __init__(self, width=320, height=144, fill="ink"):
        self.w, self.h = width, height
        self.rows = [[fill] * width for _ in range(height)]

    def dot(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.rows[y][x] = c

    def rect(self, x, y, w, h, c):
        left, right = max(0, x), min(self.w, x + w)
        for j in range(max(0, y), min(self.h, y + h)):
            if left < right:
                self.rows[j][left:right] = [c] * (right - left)

    def line(self, x, y, bx, by, c):
        steps = max(abs(bx - x), abs(by - y), 1)
        for i in range(steps + 1):
            self.dot(round(x + i * (bx - x) / steps), round(y + i * (by - y) / steps), c)

    def poly(self, points, c):
        edges = list(zip(points, points[1:] + points[:1]))
        for y in range(max(0, min(p[1] for p in points)), min(self.h, max(p[1] for p in points) + 1)):
            cuts = sorted(ax + (y - ay) * (bx - ax) / (by - ay)
                          for (ax, ay), (bx, by) in edges if min(ay, by) <= y < max(ay, by))
            for left, right in zip(cuts[::2], cuts[1::2]):
                self.rect(math.ceil(left), y, math.floor(right) - math.ceil(left) + 1, 1, c)

    def paint(self, x, y, rows, palette):
        for dy, row in enumerate(rows):
            for dx, code in enumerate(row):
                if code != ".":
                    self.dot(x + dx, y + dy, palette[code])

BAYER = ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5))


def band(value, count, x, y):
    value = min(count - 1, max(0, value))
    step = int(value)
    return step + int((value - step) * 16 > BAYER[y & 3][x & 3])


def stars(a, horizon, moon_x):
    ramp = ("ink", "void", "blue0", "blue1", "blue2", "sky", "mist")
    for y in range(horizon):
        for x in range(a.w):
            distance = math.hypot((x-moon_x) / 2.7, (y-26) * 1.5)
            glow = max(0, 1.2 - distance / 29)
            haze = .17 * math.sin(x/24 + y/5) + .14 * math.sin(x/11-y/11)
            a.dot(x, y, ramp[band((y / horizon) ** 2 * 5.6 + glow + haze, len(ramp), x, y)])
    for i in range(74):
        x, y = rng.randrange(a.w), rng.randrange(4, horizon - 8)
        if i % 13 == 0:
            a.paint(x-2, y-2, ("..a..","..b..","abcba","..b..","..a.."),
                    {"a":"blue3","b":"blue5","c":"star"})
        else:
            a.dot(x, y, rng.choice(("blue3", "blue4", "blue5", "star")))
    a.paint(moon_x-8, 17, (
        ".....bbbba......","...bbcccbbba....","..bccdcccbbaa...","..bcdcccbdcba...",
        ".bcdccbccddcba..",".bcccbbcccddca..","bccbcccdccddca..","bccdcccccdccca..",
        "bccdccbbccdcca..",".bccccbcccdbba..",".bcccdcccdbba...","..bccddddbba....",
        "...bbccbbba.....",".....aaaa......."), {"a":"blue4","b":"star","c":"moon","d":"blue5"})


def water(a, horizon, moon_x):
    stars(a, horizon, moon_x)
    colors = ("sea0", "sea1", "sea2", "sea3", "sea4", "foam")
    for y in range(horizon, a.h):
        depth = (y - horizon) / (a.h - horizon)
        phase = 10 * math.log1p((y-horizon)*.078)
        for x in range(a.w):
            lobes = math.sin(x/(13+depth*26) + phase) + .46 * math.sin(x/(4+depth*9) - phase*1.6)
            bend = .62 * math.sin(x/37+y/19) + .22 * math.sin(x/12-y/9)
            swell = math.sin(phase*2.4+bend+x/(28+depth*24)) * .84 + math.sin(phase*.83-x/47) * .36
            gleam = max(0, 1 - abs(x-moon_x+16*math.sin(y/8))/(24+depth*68)) * 1.5
            current = .41 * math.sin(x/35-y/23) + .27 * math.sin(x/15+y/14)
            value = 1.15 + lobes*.89 + swell + gleam + current
            idx = band(value, len(colors), x//2, y)
            if idx == 5 and abs(lobes) < 1.15:
                a.dot(x,y,("wave0","wave1","wave2","wave3")[(x//10+y//3)%4])
            else:
                a.dot(x,y,colors[idx])


def islands(a, y, x, size):
    ridge = [(0,0),(8,-3),(18,-3),(26,-9),(39,-12),(46,-18),(57,-17),(72,-29),
             (84,-24),(89,-22),(97,-25),(111,-19),(118,-12),(136,-7),(150,-5),(168,0)]
    silhouette = [(x+round(xx*size), y+round(yy*size)) for xx,yy in ridge]
    a.poly(silhouette + [(silhouette[-1][0],y+3),(x,y+3)],"blue0")
    a.poly([(x+round(xx*size),y+round(yy*size)) for xx,yy in
            ((40,-12),(73,-28),(85,-22),(78,-22),(73,-16),(66,-14),(54,-4),(47,-5))], "blue2")
    a.poly([(x+round(xx*size),y+round(yy*size)) for xx,yy in
            ((82,-23),(97,-25),(111,-19),(118,-12),(104,-16),(97,-21),(93,-16))], "blue1")
    a.rect(x,y+2,round(168*size),1,"blue2")


def wall(a, x, y, w, h, warm=False):
    ramps = ("deep","beam","wood0","wood1","wood2","wood3") if warm else ("ink","blue0","roof0","roof1","roof2","roof3")
    a.rect(x,y,w,h,ramps[1])
    edge = x
    while edge < x+w:
        width = min(x+w-edge,rng.randint(5,11))
        tone = rng.choice((1,1,2,2,3))
        a.rect(edge,y,width,h,ramps[tone])
        a.rect(edge,y,1,h,ramps[0])
        for _ in range(11):
            yy = rng.randrange(y,y+h)
            grain = min(h+y-yy,rng.randint(2,12))
            xx = edge+rng.randrange(1,width) if width > 1 else edge
            a.rect(xx,yy,1,grain,ramps[rng.choice((max(0,tone-1),min(5,tone+1)))])
        edge += width


def light_on(a, x, y, rx, ry, colors, warm):
    """Tint only the material already painted. Thin dithering softens the edge of the light."""
    for yy in range(max(0,y-ry),min(a.h,y+ry)):
        for xx in range(max(0,x-rx),min(a.w,x+rx)):
            before = a.rows[yy][xx]
            if before not in colors:
                continue
            distance = math.hypot((xx-x)/rx,(yy-y)/ry)
            strength = max(0,1-distance) * 4.4 + .13*math.sin(xx/4+yy/5)
            level = band(strength,len(warm)+1,xx,yy)
            if level:
                a.dot(xx,yy,warm[min(len(warm)-1,(level-1)//2 + colors.index(before)//2)])


def floor(a, pts, tone="wood0", seams="deep", gleam="wood2"):
    """Break the surface into perspective boards, then paint interrupted grain on each."""
    left, right = min(x for x,_ in pts),max(x for x,_ in pts)
    top, bottom = min(y for _,y in pts),min(a.h,max(y for _,y in pts))
    mask = Canvas(a.w,a.h,None)
    mask.poly(pts,tone)
    a.poly(pts,tone)
    y = top+1
    while y < bottom:
        depth = (y-top)/max(1,bottom-top)
        height = min(bottom-y, 3+round(depth*4))
        for x in range(left,right+1):
            if 0 <= x < a.w and mask.rows[y][x]:
                a.dot(x,y,seams)
        for _ in range(24):
            x = rng.randrange(left,right)
            yy = y+rng.randrange(height)
            for dx in range(rng.randint(3,9+round(12*depth))):
                xx = x+dx
                if 0 <= xx < a.w and mask.rows[yy][xx]:
                    a.dot(xx,yy,rng.choice((gleam,gleam,tone)) if dx < 2 else gleam)
        for x in range(left+rng.randint(12,35),right,rng.randint(29,58)):
            for j in range(height):
                if 0 <= x-j < a.w and mask.rows[y+j][x-j]:
                    a.dot(x-j,y+j,seams)
        y += height


def shingles(a, outline):
    layer = Canvas(a.w,a.h,None)
    layer.poly(outline,"roof1")
    top = min(y for _,y in outline)
    for y in range(top,a.h):
        row = (y-top)//4
        for x in range(a.w):
            if not layer.rows[y][x]:
                continue
            tile = (x + (row%2)*5 + y//3)//9
            shade = (tile*113 + row*11) % 7
            color = ("roof1","roof1","roof0","roof0","roof2","roof1","blue2")[shade]
            if (y-top)%4 == 3:
                color = "blue0"
            elif (x + (row%2)*5 + y//3)%9 == 0:
                color = "roof3" if shade in (2,4,6) else "roof0"
            a.dot(x,y,color)


def lantern(a, x, y):
    a.line(x+3,y-6,x+3,y,"ink")
    a.rect(x,y,7,11,"ink")
    a.rect(x+1,y+2,5,7,"gold1")
    a.rect(x+2,y+3,3,6,"flame0")
    a.rect(x+3,y+4,1,4,"flame1")
    a.rect(x+1,y+10,5,1,"wood4")
    a.dot(x,y+3,"iron2")

def windows(a, x, y, w=22, h=27):
    a.rect(x-3,y-3,w+6,h+6,"deep")
    a.rect(x,y,w,h,"gold0")
    a.poly([(x+2,y+2),(x+w-2,y+5),(x+w-4,y+h-2),(x+2,y+h-4)],"gold1")
    a.poly([(x+2,y+3),(x+8,y+3),(x+7,y+h-2),(x+2,y+h-3)],"gold2")
    a.rect(x+3,y+4,2,h-8,"gold3")
    a.rect(x+w//2,y,2,h,"deep")
    a.rect(x,y+h//2,w,2,"deep")
    a.rect(x-2,y+h+1,w+4,2,"wood4")

def barrel(a,x,y,w=16,h=23):
    a.poly([(x+3,y),(x+w-3,y),(x+w,y+4),(x+w-2,y+h-3),(x+w-5,y+h),(x+3,y+h),(x,y+h-5),(x-1,y+6)],"deep")
    a.poly([(x+4,y+2),(x+w-4,y+2),(x+w-1,y+6),(x+w-3,y+h-4),(x+4,y+h-2),(x+1,y+7)],"wood1")
    for u in [3,7,w-4]:
        a.line(x+u,y+4,x+u+1,y+h-4,"wood3" if u < 8 else "beam")
    for v in [5,h-7]:
        a.rect(x+1,y+v,w-1,2,"iron1")
        a.rect(x+2,y+v,w-5,1,"iron2")
    a.rect(x+4,y+1,w-8,2,"wood3")

def crate(a,x,y,w,h,mark=None,opened=False):
    if opened:
        crate(a,x,y+6,w,h-6,mark)
        a.poly([(x+2,y+7),(x+6,y),(x+w+1,y+2),(x+w-4,y+10)],"ink")
        a.poly([(x+4,y+6),(x+7,y+1),(x+w-1,y+3),(x+w-6,y+8)],"wood2")
        a.line(x+7,y+1,x+w-1,y+3,"wood4")
        a.line(x+8,y+3,x+w-3,y+5,"beam")
        a.rect(x+7,y+10,w-13,2,"ink")
        a.line(x+2,y+13,x+w-7,y+13,"wood3")
        return
    a.poly([(x,y+6),(x+8,y),(x+w,y),(x+w+3,y+h-8),(x+w-2,y+h),(x,y+h)],"deep")
    a.poly([(x+1,y+6),(x+8,y+1),(x+w-1,y+1),(x+w-5,y+6)],"wood3")
    a.rect(x+2,y+7,w-8,h-9,"wood1")
    a.poly([(x+w-6,y+6),(x+w,y+2),(x+w+1,y+h-8),(x+w-5,y+h-2)],"wood0")
    for row in range(y+9,y+h-3,5):
        a.rect(x+3,row,w-9,1,"wood2")
        a.rect(x+3,row+2,w-9,1,"beam")
    a.line(x+3,y+h-3,x+w-8,y+8,"wood3")
    if mark:
        a.rect(x+10,y+9,9,10,"paper1")
        a.paint(x+12,y+11,("###","#..","###","#.#","###"),{"#":"ink"})
        a.rect(x+11,y+(17 if mark=="6" else 9),6,1,"ink")

def piling(a, x, y, h):
    a.poly([(x-2,y+6),(x+1,y+1),(x+6,y),(x+8,y+4),(x+7,y+h),(x-3,y+h)],"ink")
    a.poly([(x-1,y+5),(x+5,y+1),(x+7,y+4),(x+4,y+10),(x,y+10)],"roof3")
    a.line(x-1,y+9,x-3,y+h-1,"roof1")
    a.line(x+4,y+11,x+3,y+h-1,"blue2")
    for dy in (11,13,15):
        a.line(x-3,y+dy,x+7,y+dy-1,"paper0" if dy==11 else "stone2")
    a.dot(x+3,y+3,"blue5")


def sail(a, x, y, reach, drop):
    a.poly([(x,y),(x+14,y+5),(x+reach-9,y+drop-13),(x+reach,y+drop),
            (x+reach-5,y+drop+5),(x+14,y+drop-1),(x,y+drop-6)],"red0")
    a.poly([(x+2,y+3),(x+20,y+9),(x+reach-9,y+drop-13),(x+reach-2,y+drop),
            (x+27,y+drop-2),(x+5,y+drop-7)],"red1")
    a.poly([(x+4,y+3),(x+15,y+7),(x+37,y+25),(x+43,y+drop-7),
            (x+29,y+drop-9),(x+14,y+drop-13),(x+6,y+drop-9)],"red2")
    a.poly([(x+7,y+6),(x+16,y+10),(x+20,y+16),(x+10,y+drop-15),
            (x+7,y+drop-11),(x+5,y+drop-14)],"red3")
    a.line(x+15,y+drop-1,x+reach-3,y+drop+3,"wood3")
    a.line(x+reach-5,y+drop,x+reach-2,y+drop+3,"paper0")
    a.line(x,y-4,x-2,y+drop+26,"ink")
    a.line(x+1,y-4,x,y+drop+26,"wood2")
    a.line(x+1,y-3,x+1,y+7,"paper0")


def ferry_hull(a, left, y, right):
    a.poly([(left,y-1),(left+34,y-3),(right-18,y-2),(right,y-10),(right-5,y+12),
            (right-15,y+24),(left+52,y+29),(left+26,y+22),(left+11,y+13)],"ink")
    a.poly([(left+3,y),(left+34,y-2),(right-13,y+1),(right-2,y-8),(right-8,y+6),
            (left+62,y+12),(left+28,y+9),(left+12,y+5)],"wood2")
    a.poly([(left+17,y+11),(left+50,y+13),(right-7,y+7),(right-15,y+21),
            (left+52,y+26),(left+33,y+22)],"red0")
    a.poly([(left+21,y+11),(left+55,y+14),(right-7,y+7),(right-13,y+14),
            (left+65,y+19),(left+40,y+17)],"red1")
    a.line(left+12,y+5,left+63,y+9,"wood4")
    a.line(left+63,y+9,right-10,y+3,"wood3")
    a.line(left+40,y+21,right-18,y+18,"beam")
    for xx,yy in ((left+17,y+7),(left+39,y+9),(right-39,y+4),(right-12,y+1)):
        a.rect(xx,yy,4,2,"bark")
        a.dot(xx+1,yy,"paper0")


def entrance():
    a = Canvas()
    water(a, 73, 249)
    islands(a,70,151,1)
    islands(a,72,204,.73)
    wall(a,0,43,150,75)
    a.poly([(104,30),(163,49),(148,110),(127,112),(131,51)],"blue0")
    a.poly([(130,47),(147,52),(141,101),(127,109),(130,85)],"roof1")
    a.line(148,50,143,103,"roof3")
    roof=[(-6,44),(31,22),(49,18),(104,24),(122,33),(162,48),(153,55),
          (103,49),(72,52),(43,49),(-8,55)]
    a.poly(roof,"ink")
    shingles(a,[(-5,43),(30,22),(49,18),(104,24),(125,35),(157,48),(103,45),(44,47),(-6,52)])
    a.line(49,19,105,25,"roof3")
    a.line(105,25,157,48,"blue4")
    a.line(0,53,42,48,"roof2")
    a.line(43,48,102,48,"roof1")
    windows(a,17,65,22,28)
    light_on(a,32,83,42,40,("blue0","roof0","roof1"),("bark","beam","wood0","wood1"))
    windows(a,17,65,22,28)
    a.poly([(75,61),(85,56),(111,55),(119,61),(116,111),(74,112)],"ink")
    a.poly([(80,64),(86,60),(112,59),(114,64),(111,110),(79,111)],"wood0")
    for x in range(82,112,6):
        a.line(x,64,x-1,110,"deep")
        a.line(x+1,62,x,109,"wood2")
    a.poly([(81,65),(95,59),(112,60),(112,68),(84,76)],"beam")
    a.line(74,61,115,57,"wood4")
    a.rect(106,89,5,2,"gold2")
    light_on(a,123,67,25,32,("blue0","roof0","roof1","wood0","wood1"),("bark","beam","wood1","wood3"))
    lantern(a,123,61)
    a.line(126,76,157,73,"bark")
    a.line(132,74,136,80,"iron3")
    a.line(151,74,148,79,"iron3")
    a.poly([(128,80),(155,77),(160,95),(131,101)],"deep")
    a.poly([(130,81),(153,79),(158,94),(132,97)],"wood3")
    a.line(131,81,154,79,"paper0")
    a.paint(135,83,("abcabcabcabcab","b..b...b......",".bcacb..abcab.","b..c..b....a..","..abcababc...."),
            {"a":"paper1","b":"paper2","c":"beam"})
    a.line(132,97,157,94,"wood0")
    a.line(157,64,188,71,"ink")
    a.line(188,71,220,55,"ink")
    sail(a,224,47,56,48)
    a.line(223,43,179,96,"iron0")
    a.line(223,45,292,95,"iron1")
    ferry_hull(a,175,100,314)
    a.rect(253,106,18,4,"wood0")
    a.line(253,106,271,106,"wood4")
    a.poly([(0,117),(166,111),(198,115),(202,126),(183,144),(0,144)],"ink")
    floor(a,[(0,115),(166,109),(197,114),(189,131),(0,138)],"roof1","blue0","roof2")
    a.line(0,114,95,111,"roof3")
    a.line(104,111,166,108,"blue4")
    a.line(132,134,183,129,"roof3")
    a.poly([(12,113),(29,110),(56,108),(73,114),(55,122),(26,122)],"roof0")
    barrel(a,44,91,17,24)
    for x,y,h in ((17,119,27),(50,121,26),(143,116,30),(184,116,29)):
        piling(a,x,y,h)
    return a


def plaster(a):
    a.rect(0,14,320,104,"beam")
    for _ in range(64):
        x, y = rng.randrange(-13,318),rng.randrange(15,105)
        width, height = rng.randint(7,40),rng.randint(5,22)
        a.poly([(x,y+4),(x+width//3,y),(x+width,y+3),(x+width-3,y+height),
                (x+5,y+height+1)],rng.choice(("bark","beam","wood0","wood1","stone2")))
    for row,y in enumerate(range(59,112,9)):
        for x in range(-12+(row%2)*10,323,23):
            a.line(x,y,x+22,y-1,"bark")
            a.line(x+22,y-1,x+22,y+7,"stone1")
    light_on(a,147,66,107,69,("bark","beam","wood0","wood1","stone2"),("wood0","wood1","wood2","wood3"))
    light_on(a,269,72,55,58,("bark","beam","wood0"),("stone1","stone2","stone3"))


def office():
    a = Canvas(fill="deep")
    plaster(a)
    for x in (17,123,278):
        a.poly([(x,9),(x+8,10),(x+14,109),(x+4,112),(x+2,97)],"deep")
        a.poly([(x+5,13),(x+9,15),(x+12,99),(x+8,108)],"wood0")
        a.line(x+8,13,x+13,105,"wood3")
    for x,y in ((39,35),(66,43),(82,29),(241,45),(253,54)):
        a.poly([(x,y),(x+14,y-2),(x+13,y+9),(x+1,y+10)],"paper0")
        a.line(x+2,y+2,x+10,y+1,"wood1")
        a.line(x+4,y+5,x+10,y+4,"gold0")
    a.poly([(0,0),(320,0),(320,15),(286,15),(161,23),(91,14),(0,22)],"ink")
    for x,y in ((-45,2),(26,-1),(91,-4),(162,0),(234,2)):
        a.poly([(x,y),(x+20,y),(x+79,y+17),(x+65,y+21)],"bark")
        a.line(x+16,y+2,x+75,y+17,"wood1")
    a.line(0,21,89,15,"wood3")
    a.line(90,15,162,21,"wood2")
    a.poly([(130,31),(137,26),(210,25),(220,31),(221,88),(132,90)],"deep")
    a.poly([(135,35),(141,30),(213,30),(217,38),(216,86),(136,89)],"ink")
    a.poly([(150,77),(167,50),(195,42),(215,41),(216,86),(144,86)],"beam")
    a.rect(166,47,49,3,"wood3")
    a.line(170,46,214,45,"wood2")
    for x,y,h in ((174,43,7),(179,41,8),(187,39,10),(194,40,10),(204,41,8),(210,37,13)):
        a.rect(x,y,3,h,"gold0")
        a.dot(x,y,"paper0")
    a.line(134,33,135,88,"wood4")
    a.line(137,29,208,27,"wood3")
    a.line(214,31,216,88,"wood2")
    lantern(a,141,39)
    floor(a,[(0,106),(320,102),(320,144),(0,144)],"wood0","deep","wood1")
    a.poly([(0,104),(10,103),(61,111),(110,113),(163,104),(163,110),(109,122),(63,118),(0,117)],"bark")
    a.poly([(21,108),(89,108),(115,130),(39,140),(11,129)],"red0")
    a.line(21,110,89,110,"red2")
    a.line(39,137,110,130,"red2")
    a.line(17,128,37,135,"wood2")
    a.poly([(0,69),(15,71),(24,79),(22,129),(0,138)],"ink")
    a.poly([(0,74),(13,76),(18,81),(17,129),(0,134)],"blue1")
    a.line(15,79,17,129,"roof3")
    a.poly([(283,65),(291,59),(320,56),(320,114),(285,122)],"ink")
    a.poly([(289,68),(294,63),(320,61),(320,113),(289,117)],"blue1")
    a.line(289,68,289,117,"wood3")
    a.line(294,63,319,59,"wood4")
    a.poly([(290,117),(320,111),(320,126),(285,130)],"beam")
    barrel(a,242,87,20,27)
    crate(a,45,83,26,23)
    crate(a,62,91,34,22)
    a.poly([(126,87),(215,84),(226,90),(225,105),(132,111)],"deep")
    a.poly([(126,87),(216,85),(225,90),(133,95)],"wood3")
    a.poly([(132,95),(225,91),(223,105),(133,109)],"wood0")
    a.poly([(130,87),(148,86),(166,87),(166,91),(143,92)],"wood4")
    a.line(132,95,178,93,"paper0")
    a.line(179,93,224,91,"wood2")
    a.line(138,101,179,99,"beam")
    a.line(173,105,214,102,"wood1")
    a.poly([(190,88),(205,85),(211,87),(197,91)],"paper2")
    a.line(195,88,205,86,"gold0")
    a.rect(157,85,6,3,"red0")
    a.rect(159,82,3,4,"red2")
    a.dot(159,82,"red3")
    return a


def warehouse():
    a = Canvas()
    water(a, 75, 264)
    islands(a,74,199,.8)
    wall(a,0,0,198,98)
    a.poly([(0,26),(72,24),(195,40),(196,48),(66,37),(0,42)],"blue0")
    a.poly([(0,26),(76,22),(198,38),(194,43),(72,31),(0,35)],"roof0")
    a.line(1,31,72,25,"roof2")
    a.line(72,25,194,41,"roof2")
    a.poly([(0,0),(320,0),(320,9),(279,14),(232,13),(180,18),(91,14),(36,20),(0,24)],"ink")
    a.line(3,24,36,17,"roof2")
    a.line(84,14,180,17,"roof3")
    a.line(181,17,279,12,"roof1")
    for x,lean in ((23,8),(101,-7),(184,7),(272,-5)):
        a.poly([(x,12),(x+8,12),(x+8+lean,144),(x+lean,144)],"ink")
        a.line(x+8,13,x+8+lean,143,"roof3")
        a.line(x+4,16,x+4+lean,139,"roof1")
    light_on(a,57,49,63,56,("blue0","roof0","roof1","roof2"),("bark","beam","wood0","wood1"))
    a.poly([(0,54),(17,55),(26,63),(22,97),(0,100)],"ink")
    a.poly([(0,57),(16,59),(21,66),(19,95),(0,97)],"gold0")
    a.poly([(0,75),(10,71),(18,78),(19,95),(0,97)],"wood2")
    a.line(18,61,21,68,"wood4")
    lantern(a,53,39)
    for x in (201,244):
        a.line(x,18,x+1,136,"ink")
        a.line(x+1,20,x+2,134,"iron2")
        a.line(x+2,28,x+3,124,"roof0")
    a.poly([(0,96),(196,94),(197,108),(0,127)],"ink")
    floor(a,[(0,86),(191,82),(197,99),(0,106)],"roof1","blue0","roof2")
    a.line(0,104,109,101,"roof3")
    a.line(112,101,196,98,"roof2")
    for x,y in ((11,110),(34,108),(76,106),(121,104),(157,102)):
        a.poly([(x,y),(x+7,y-1),(x+15,144),(x+8,144)],"ink")
        a.line(x+7,y-1,x+15,143,"roof2")
    a.poly([(24,111),(67,108),(82,133),(75,142)],"roof0")
    a.line(27,111,78,141,"blue3")
    floor(a,[(248,122),(320,117),(320,139),(243,142)],"roof1","blue0","roof2")
    a.line(248,122,319,117,"roof3")
    ferry_hull(a,277,118,334)
    piling(a,271,123,21)
    for x,y in ((178,71),(253,106)):
        a.poly([(x,y),(x+11,y-2),(x+13,y+9),(x+1,y+12)],"ink")
        a.poly([(x+2,y+1),(x+10,y),(x+11,y+8),(x+2,y+10)],"iron2")
        a.rect(x+4,y+2,5,5,"ink")
        a.rect(x+5,y+2,3,1,"roof3")
        a.dot(x+2,y+8,"iron3")
        a.dot(x+9,y+1,"paper0")
    return a


def crossing():
    a = Canvas()
    water(a, 66, 243)
    islands(a,66,188,.92)
    a.poly([(0,124),(30,116),(153,112),(292,107),(320,110),(320,144),(0,144)],"deep")
    floor(a,[(0,126),(29,118),(154,115),(296,109),(320,111),(320,141),(0,145)],"wood0","deep","wood1")
    light_on(a,209,127,65,23,("deep","wood0","wood1"),("beam","wood1","wood2","wood3"))
    a.line(0,124,145,114,"wood3")
    a.line(146,114,298,108,"wood3")
    for x,y in ((4,122),(31,118),(81,116),(145,113),(247,109),(297,108)):
        a.rect(x,y-14,5,17,"deep")
        a.rect(x+1,y-15,2,15,"wood3")
        a.rect(x,y-15,5,2,"wood4")
    a.line(4,109,146,98,"beam")
    a.line(4,108,146,97,"wood3")
    a.line(146,98,298,93,"wood0")
    a.line(147,97,297,92,"wood2")
    sail(a,212,27,105,55)
    a.line(212,28,303,109,"wood2")
    a.line(212,28,169,114,"iron0")
    a.line(63,28,5,121,"iron0")
    a.line(63,28,104,113,"iron0")
    a.line(211,39,208,118,"wood4")
    barrel(a,281,104,18,24)
    lantern(a,206,93)
    a.poly([(0,140),(30,134),(61,139),(95,138),(130,144),(0,144)],"ink")
    a.line(0,139,30,133,"wood3")
    a.line(30,133,63,137,"wood2")
    return a


SKIPPER_FACE = (
    "......cccccc.....","....ccssssccc....","...csssshhssc....","...csshhhhscc....",
    "...csshhwhscc....","...cshhseshhs....","...cshhhhssscc...","...cssshshhhscc..",
    "....cssbbcssscc..","....cbsbbcbbcc...",".....cbbbbbc.....","......ccccc......",
)
CLERK_FACE = (
    "....ccccc.......","...csssscc......","..csshhhhsc.....","..cshhhhhsc.....",
    "..csheeehsc.....","..csewgewsc.....","..cshshshsc.....","...csshhsc......",
    "...csshhsc......","....csssc.......",".....ccc........",
)
FACE = {"c":"deep","s":"skin0","h":"skin1","w":"skin2","e":"paper2","g":"ink","b":"paper0"}


def sleeve(a, shoulder, elbow, hand, tones, hand_color="skin1"):
    sx,sy = shoulder
    ex,ey = elbow
    hx,hy = hand
    a.poly([(sx-3,sy),(sx+3,sy-2),(ex+2,ey-1),(hx+1,hy-3),(hx+3,hy+1),
            (ex,ey+3),(sx-3,sy+5)],tones[0])
    a.line(sx+1,sy,ex+1,ey,tones[2])
    a.line(ex,ey,hx,hy-2,tones[1])
    a.poly([(hx-1,hy-2),(hx+3,hy-2),(hx+4,hy),(hx+1,hy+2),(hx-2,hy)],hand_color)
    a.dot(hx+1,hy-2,"skin2")


def mug(a,x,y,tilt=False):
    if tilt:
        a.poly([(x,y),(x+5,y-2),(x+7,y+2),(x+3,y+4),(x,y+2)],"iron0")
        a.line(x,y,x+5,y-2,"blue5")
        a.line(x+1,y+2,x+5,y+1,"iron3")
        a.paint(x+5,y+3,("aa..","..a.","..ba","....","...b"),{"a":"sea4","b":"foam"})
    else:
        a.poly([(x,y),(x+7,y),(x+6,y+6),(x+2,y+7),(x+1,y+5)],"iron0")
        a.rect(x+1,y+1,5,5,"iron2")
        a.rect(x+2,y+2,1,4,"iron3")
        a.rect(x,y,7,1,"blue5")
        a.line(x+6,y+1,x+8,y+1,"iron3")
        a.line(x+8,y+1,x+7,y+4,"iron1")


def skipper(frame):
    a = Canvas(38,47,None)
    bend = (0,0,0,0,3,1,-1,0)[frame]
    head = (0,0,0,0,2,1,-1,0)[frame]
    a.poly([(6,44),(13,42),(25,42),(31,45),(27,47),(6,47),(3,46)],"ink")
    a.poly([(10,32),(18,32),(19,38),(16,44),(9,45),(7,43),(9,39)],"ink")
    a.poly([(18,34),(23,33),(25,36),(24,43),(29,44),(29,46),(20,46),(19,43)],"ink")
    a.poly([(11,33),(16,34),(16,38),(13,42),(10,42)],"iron1")
    a.poly([(20,36),(24,35),(24,41),(21,42)],"iron1")
    a.line(8,44,14,44,"iron2")
    a.line(21,44,26,44,"iron2")
    a.poly([(9,17+bend),(15,15+bend),(23,17+bend),(26,23+bend),(25,29),
            (27,34),(24,37),(7,37),(7,32),(6,27),(7,22)],"ink")
    a.poly([(10,19+bend),(15,16+bend),(21,17+bend),(24,22+bend),(23,28),
            (26,34),(20,35),(8,35),(8,27)],"blue1")
    a.poly([(9,24+bend),(12,20+bend),(15,20+bend),(15,26),(11,32),(8,33)],"blue3")
    a.poly([(17,17+bend),(21,18+bend),(22,22+bend),(18,26),(17,32),(15,31),(15,24)],"red0")
    a.poly([(18,17+bend),(23,18+bend),(22,21+bend),(18,22+bend)],"gold2")
    a.line(18,26,21,24,"blue4")
    a.line(11,33,14,33,"blue2")
    a.dot(17,29,"gold2")
    a.dot(17,32,"gold1")
    a.paint(11+bend,5+head,SKIPPER_FACE,FACE)
    a.poly([(11+bend,7+head),(13+bend,3+head),(17+bend,1+head),(23+bend,2+head),
            (26+bend,4+head),(26+bend,7+head),(30+bend,8+head),(30+bend,9+head),(10+bend,9+head)],"ink")
    a.poly([(13+bend,6+head),(17+bend,2+head),(23+bend,3+head),(26+bend,6+head),
            (23+bend,7+head),(13+bend,8+head)],"blue3")
    a.line(16+bend,7+head,25+bend,6+head,"gold1")
    a.dot(20+bend,6+head,"gold3")
    a.line(23+bend,9+head,29+bend,9+head,"blue4")
    if frame == 1:
        a.rect(21+bend,10+head,3,1,"skin0")
    else:
        a.dot(22+bend,10+head,"eye")
        a.dot(23+bend,10+head,"ink")
    if frame in (2,3):
        a.rect(24+bend,13+head,3,1+(frame==3),"deep")
        a.dot(25+bend,13+head,"red2")
    hand = ((25,31),(25,31),(25,31),(25,31),(29,38),(29,26),(30,16),(26,29))[frame]
    elbow = ((20,31),(20,31),(20,31),(20,31),(23,33),(24,29),(24,23),(22,30))[frame]
    sleeve(a,(15+bend,22+bend),elbow,hand,("blue0","blue2","blue4"))
    mug(a,hand[0]-1,hand[1]-5,frame==6)
    return a


def clerk(frame):
    a = Canvas(38,47,None)
    lean = (0,0,0,0,-1,3,1,0)[frame]
    nod = (0,0,0,0,-1,2,1,0)[frame]
    a.poly([(10,44),(16,42),(24,43),(27,46),(8,47)],"ink")
    a.poly([(13,31),(23,31),(23,39),(25,45),(21,46),(19,40),(18,38),(16,44),(11,45),(12,39)],"ink")
    a.line(13,34,14,42,"iron1")
    a.line(22,37,22,43,"iron1")
    a.poly([(11,18),(16,16),(22,17),(26,21),(25,29),(27,34),(23,36),
            (10,35),(9,27)],"deep")
    a.poly([(12,20),(17,17),(21,18),(23,21),(22,29),(24,33),(19,34),(12,32)],"red0")
    a.poly([(14,19),(16,19),(19,22),(18,31),(15,31),(13,28)],"red1")
    a.poly([(16,16),(20,17),(21,23),(17,22),(15,21)],"paper1")
    a.line(17,23,18,30,"gold1")
    a.dot(19,25,"gold3")
    a.dot(19,28,"gold2")
    a.paint(10+lean,6+nod,CLERK_FACE,FACE)
    a.poly([(12+lean,7+nod),(14+lean,3+nod),(20+lean,2+nod),(23+lean,4+nod),
            (24+lean,7+nod),(20+lean,7+nod),(18+lean,6+nod)],"stone0")
    a.line(15+lean,4+nod,20+lean,3+nod,"paper0")
    a.line(12+lean,11+nod,22+lean,11+nod,"gold3")
    a.dot(14+lean,12+nod,"ink")
    a.dot(19+lean,12+nod,"ink")
    a.dot(20+lean,11+nod,"eye")
    if frame == 1:
        a.line(13+lean,12+nod,20+lean,12+nod,"skin0")
    if frame in (2,3):
        a.rect(16+lean,15+nod,4,1+(frame==3),"deep")
    hand = ((23,29),(23,29),(23,29),(23,29),(25,15),(28,29),(25,24),(23,29))[frame]
    elbow = ((22,26),(22,26),(22,26),(22,26),(25,24),(24,26),(23,27),(22,26))[frame]
    sleeve(a,(20,21),elbow,hand,("beam","paper0","paper1"))
    if frame >= 4:
        a.rect(hand[0]+1,hand[1]-3,3,5,"red1")
        a.rect(hand[0]-1,hand[1]+1,7,2,"red0")
        a.dot(hand[0]+1,hand[1]-3,"red3")
    return a


def crab(frame):
    a = Canvas(16,11,None)
    legs = (
        ("..r........r....","..Rb..b...bR....","...rbbRbbbR....."),
        (".r..........r...","..Rb..b....Rb...","...rbbRbbbRb...."),
        ("r............r..",".Rb...b.....Rb..","..rbbbRbbbbRb..."),
        (".r...........r..","..Rb..b...Rb....","...rbbRbbbRb...."),
    )
    a.paint(0,0,legs[frame] + (
        "....rRRRRRrr....","...rRRRRRRRrr...","..rRRRrRrRrbb...","...brrrrrbb.....",
        "..r.b.b.b.b.r...","..b.........b..."),{"r":"red2","R":"red3","b":"red0"})
    a.dot(6,3,"eye")
    a.dot(9,3,"paper1")
    a.line(1+frame%2,8,3+frame%2,7,"red1")
    a.line(12-frame%2,7,14-frame%2,8,"red1")
    return a


def sprites():
    a = Canvas(320,128,None)
    rects = {}
    def region(name,x,y,w,h):
        rects[name] = [x,y,w,h]
    for who, y, draw in (("skipper",0,skipper),("clerk",47,clerk)):
        for i in range(8):
            image = draw(i)
            x = i*image.w
            region(f"{who}{i}",x,y,image.w,image.h)
            for row, colors in enumerate(image.rows):
                a.rows[y+row][x:x+image.w] = colors
    for i in range(4):
        image = crab(i)
        x,y = i*16,94
        region(f"crab{i}",x,y,image.w,image.h)
        for row, colors in enumerate(image.rows):
            a.rows[y+row][x:x+image.w] = colors
    for i in range(2):
        for offset, opened in ((0,False),(52,True)):
            x,y = 64+offset+i*26,94
            region(f"{'open' if opened else 'crate'}{i}",x,y,26,27)
            crate(a,x,y,22,26,"6" if i==0 else "9",opened)
            if not opened:
                a.line(x+2,y+6,x+10,y+1,"wood4")
                a.line(x+2,y+20,x+8,y+19,"wood3")
            a.dot(x+21,y+19,"bark")
    region("lift",168,94,52,19)
    a.poly([(168,106),(174,99),(217,97),(219,101),(217,110),(171,112),(168,109)],"ink")
    a.poly([(169,106),(174,100),(217,98),(218,103),(213,107),(169,109)],"wood2")
    for x in range(172,213,7):
        a.line(x,107,x+5,101,"beam")
        a.line(x+2,105,x+6,101,"wood4")
    a.line(169,107,215,104,"wood4")
    a.line(171,110,217,108,"beam")
    for x in (169,216):
        a.rect(x,97,3,12,"iron1")
        a.line(x+1,96,x+1,104,"iron3")
    a.line(171,95,217,94,"iron2")
    region("beam",220,94,37,12)
    a.poly([(220,99),(233,97),(254,94),(256,96),(255,103),(224,106),(220,104)],"ink")
    a.line(222,99,252,96,"roof3")
    a.line(225,102,252,99,"roof1")
    a.rect(223,100,2,4,"iron1")
    a.rect(248,97,2,5,"iron1")
    region("rope",220,106,23,11)
    a.line(220,107,241,116,"deep")
    a.line(220,106,242,115,"wood4")
    a.line(220,106,227,109,"paper0")
    region("shutter",257,94,55,24)
    a.rect(257,94,55,24,"beam")
    for y in range(95,117,4):
        a.rect(257,y,55,1,"wood3")
        a.rect(257,y+2,55,1,"deep")
        a.line(262,y,273,y,"wood4")
    a.rect(282,111,6,2,"iron3")
    for i in range(3):
        x,y=168+i*12,115
        region(f"leak{i}",x,y,12,11)
        a.line(x,y+2,x+4+i,y+4,"sea4")
        a.line(x+3,y+4,x+8+i,y+8,"foam")
        a.dot(x+8,y+9,"blue5")
        a.dot(x+4+i,y+6,"wave2")
    region("patch",204,115,12,11)
    a.rect(204,116,4,4,"wood2")
    a.dot(204,116,"wood4")
    a.dot(207,119,"deep")
    return a, rects


def main():
    skill, out, preview = (Path(p).resolve() for p in sys.argv[1:])
    out.mkdir(parents=True, exist_ok=True)
    preview.mkdir(parents=True, exist_ok=True)
    preview = Path(tempfile.mkdtemp(prefix="proof-", dir=preview))
    atlas, rects = sprites()
    drawings = [("cargo-office",entrance()),("clerk",office()),("warehouse",warehouse()),("crossing",crossing()),("sprites",atlas)]
    index = {value: i + 32 for i, value in enumerate(PALETTE.values())}
    animated = {name: index[PALETTE[name]] for name in ("wave0","wave1","wave2","wave3","flame0","flame1")}
    binary = bytearray()
    for name, art in drawings:
        spec = {"title":name,"width":art.w,"height":art.h,"palette":PALETTE,"grid":art.rows,
                "art_direction":{"use":"sprite atlas" if name=="sprites" else "scene","projection":"side view with shallow depth","light":"moon and oil lamps"}}
        path = preview / f"{name}.json"
        path.write_text(json.dumps(spec), encoding="utf-8")
        folder = preview / name
        subprocess.run([sys.executable,"-I",str(skill / "scripts/build_pixel_art.py"),"from-spec",str(path),"--output",str(folder),"--scale","1"],check=True,stdout=subprocess.DEVNULL)
        result = json.loads((folder / "pixel-art.json").read_text(encoding="utf-8"))
        binary.extend(index[p.lower()] if p else 0 for row in result["grid"] for p in row)
    (out / "art.bin").write_bytes(binary)
    rgb = [[int(c[i:i+2],16) for i in (1,3,5)] for c in PALETTE.values()]
    (out / "art-data.ts").write_text(
        "// Generated by draw.py with Pixel Art HTML.\nexport const palette = "
        + json.dumps(rgb) + ";\nexport const atlas = " + json.dumps(rects) + " as const;\n"
        + "export const atlasSize = " + json.dumps([atlas.w,atlas.h]) + " as const;\n"
        + "export const animated = " + json.dumps(animated) + " as const;\n",encoding="utf-8")
    print(preview)

if __name__ == "__main__":
    main()
