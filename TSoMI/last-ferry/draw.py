"""Draw the native room backgrounds and sprite atlas, then compile with Pixel Art HTML."""
import json
import math
import random
import subprocess
import sys
import tempfile
from pathlib import Path

PALETTE = dict(item.split("=") for item in (
    "ink=0a0a18 void=100e23 blue0=10162d blue1=19243c blue2=233555 blue3=354a71 "
    "blue4=526486 blue5=6e82a0 sky=30416a mist=465378 star=9ba3ca moon=c7b8cf "
    "sea0=102033 sea1=142b45 sea2=1e4159 sea3=2b5870 sea4=3d7284 foam=7496a0 "
    "deep=211727 bark=322334 beam=473039 wood0=533843 wood1=68434a wood2=80534f "
    "wood3=9b6a55 wood4=b68161 roof0=24223c roof1=353450 roof2=454969 roof3=57597e "
    "stone0=282536 stone1=3b344a stone2=494259 stone3=61536a stone4=73617a "
    "iron0=202430 iron1=3c4153 iron2=555e68 iron3=7b8783 "
    "red0=542637 red1=853c43 red2=a9554d red3=cc7157 "
    "green0=1d3537 green1=2f4c48 green2=4c6555 green3=6f8061 "
    "gold0=77432f gold1=ae683c gold2=d6944c gold3=f3bf65 gold4=ffdc91 "
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

def water(a, horizon, moon_x):
    ramps = ["ink", "void", "blue0", "blue1", "blue2", "sky", "mist"]
    for y in range(horizon):
        u = (y / horizon) ** 1.75 * 6
        k = int(u)
        a.rect(0, y, 320, 1, ramps[k])
        if k < 6:
            for x in range((y * 2 + y // 2) % 4, 320, 4):
                if u % 1 > .25:
                    a.dot(x, y, ramps[k + 1])
    for _ in range(90):
        x, y = rng.randrange(320), rng.randrange(2, horizon - 7)
        a.dot(x, y, rng.choice(["blue3", "blue4", "star"]))
    for y in range(-8, 9):
        for x in range(-8, 9):
            if x*x + y*y < 69:
                a.dot(moon_x + x, 25 + y, "moon" if x + y < 6 else "blue5")
    a.rect(0, horizon, 320, 144-horizon, "sea0")
    for y in range(horizon, 144):
        depth = (y - horizon) / (144 - horizon)
        for _ in range(8 + int(depth * 12)):
            x = rng.randrange(320)
            length = rng.randint(2, 8 + int(depth * 23))
            a.rect(x, y, length, 1, rng.choice(["sea1", "sea1", "sea2", "sea3", "blue1"]))
            if abs(x - moon_x) < (8 + depth * 42):
                a.rect(x, y, max(1, length // 3), 1, rng.choice(["sea3", "sea4", "foam"]))

def wall(a, x, y, w, h, warm=False):
    tones = ("wood0", "wood1", "wood2", "beam") if warm else ("blue0", "roof0", "roof1", "deep")
    a.rect(x, y, w, h, tones[0])
    for xx in range(x + 5, x + w, 8):
        a.rect(xx, y, 1, h, tones[3])
        a.rect(xx + 1, y + 1, 1, h - 2, tones[1])
        for _ in range(6):
            yy = rng.randint(y, y+h-4)
            a.rect(xx + rng.randint(2, 4), yy, 1, rng.randint(1, 4), rng.choice(tones[1:]))
    a.rect(x, y, 2, h, tones[2])

def floor(a, pts, tone="wood0", seams="deep", gleam="wood2"):
    a.poly(pts, tone)
    for y in range(min(y for _, y in pts)+2, max(y for _, y in pts), 3):
        edges = list(zip(pts, pts[1:] + pts[:1]))
        xs = sorted(round(x + (y - ay) * (bx - x) / (by - ay)) for (x,ay),(bx,by) in edges if min(ay,by) <= y < max(ay,by))
        if len(xs) < 2:
            continue
        for x in range(xs[0], xs[-1], 1):
            if rng.random() < .25:
                a.dot(x, y, rng.choice([gleam, seams, tone]))
        if y % 2:
            a.rect(xs[0], y, xs[-1] - xs[0], 1, seams)
            for x in range(xs[0] + y % 13, xs[-1], 36):
                a.rect(x, y+1, 1, 2, seams)

def lantern(a, x, y):
    a.line(x+3,y-6,x+3,y,"ink")
    a.rect(x,y,7,11,"ink")
    a.rect(x+1,y+2,5,7,"gold1")
    a.rect(x+2,y+3,3,6,"gold3")
    a.rect(x+3,y+4,1,4,"gold4")
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
    a.poly([(x,y+6),(x+8,y),(x+w,y),(x+w+3,y+h-8),(x+w-2,y+h),(x,y+h)],"deep")
    a.poly([(x+1,y+6),(x+8,y+1),(x+w-1,y+1),(x+w-5,y+6)],"wood3" if not opened else "ink")
    a.rect(x+2,y+7,w-8,h-9,"wood1")
    a.poly([(x+w-6,y+6),(x+w,y+2),(x+w+1,y+h-8),(x+w-5,y+h-2)],"wood0")
    for row in range(y+9,y+h-3,5):
        a.rect(x+3,row,w-9,1,"wood2")
        a.rect(x+3,row+2,w-9,1,"beam")
    a.line(x+3,y+h-3,x+w-8,y+8,"wood3")
    if mark:
        a.rect(x+10,y+9,9,10,"paper1")
        a.paint(x+12,y+11,("###","#..","###","#.#","###") if mark=="6" else ("###","#.#","###","..#","###"),{"#":"ink"})
        a.rect(x+11,y+(17 if mark=="6" else 9),6,1,"ink")

def entrance():
    a = Canvas()
    water(a, 73, 248)
    a.poly([(172,72),(186,66),(195,65),(205,58),(215,59),(227,50),(239,55),(258,52),(268,57),(296,67),(320,70),(320,74)],"blue0")
    wall(a,0,45,147,71)
    a.poly([(0,40),(38,18),(110,23),(156,49),(132,53),(0,54)],"roof0")
    a.poly([(0,39),(39,19),(111,24),(149,47),(114,42),(37,32),(0,47)],"roof1")
    for y in range(24,49,4):
        for x in range(max(0,44-(y-22)*2), min(150, 107+(y-23)*2), 7):
            a.line(x,y,x+4,y+1,rng.choice(["roof2","roof2","roof3","roof0"]))
    a.rect(1,51,143,4,"ink")
    windows(a,15,62,22,30)
    a.rect(76,59,42,53,"ink")
    a.rect(79,62,37,50,"wood0")
    for x in range(80,114,6):
        a.rect(x,62,1,49,"deep")
        a.rect(x+1,63,1,47,"wood2")
    a.rect(76,58,43,2,"wood3")
    a.rect(108,88,4,2,"gold2")
    lantern(a,123,61)
    a.line(127,73,151,73,"wood3")
    a.line(132,73,134,79,"iron3")
    a.line(147,73,146,78,"iron3")
    a.poly([(128,80),(157,77),(160,96),(130,100)],"deep")
    a.poly([(130,81),(155,79),(158,94),(132,97)],"wood3")
    a.rect(133,84,19,1,"paper2")
    a.rect(135,87,15,1,"paper1")
    a.rect(136,90,13,1,"paper1")
    a.line(131,97,158,94,"wood0")
    a.line(141,57,164,64,"iron0")
    a.line(164,64,180,56,"iron0")
    a.line(176,55,229,98,"ink")
    a.line(177,54,230,97,"wood1")
    a.poly([(222,43),(232,52),(275,94),(222,89)],"red0")
    a.poly([(225,47),(247,68),(265,88),(227,84)],"red1")
    a.line(220,40,220,117,"wood3")
    a.line(219,41,219,115,"deep")
    a.poly([(175,104),(220,97),(282,100),(311,94),(298,123),(248,132),(193,126)],"ink")
    a.poly([(178,103),(228,99),(286,103),(305,98),(296,112),(205,118)],"wood1")
    a.poly([(192,116),(240,114),(296,108),(291,122),(249,128),(199,125)],"red0")
    a.line(184,108,296,107,"wood4")
    a.line(195,121,288,117,"red1")
    a.rect(254,106,18,3,"wood3")
    a.rect(273,105,3,8,"beam")
    floor(a,[(0,112),(166,107),(205,114),(190,138),(0,141)],"roof1","roof0","roof3")
    a.line(0,112,166,107,"roof3")
    a.line(0,138,190,137,"blue3")
    for x in [18,49,148,184]:
        a.poly([(x,117),(x+5,114),(x+9,118),(x+8,144),(x,144)],"ink")
        a.line(x+2,119,x+2,144,"roof3")
        a.rect(x-1,123,9,2,"iron2")
    barrel(a,42,90,19,28)
    return a

def office():
    a = Canvas(fill="deep")
    wall(a,0,7,320,102,True)
    a.poly([(0,0),(320,0),(320,20),(288,15),(160,20),(27,15),(0,22)],"ink")
    a.line(0,19,319,16,"wood2")
    for x in [14,123,287]:
        a.poly([(x,8),(x+8,9),(x+15,111),(x+2,112)],"deep")
        a.line(x+8,11,x+14,108,"wood2")
    for x,y in [(28,26),(41,43),(65,24),(98,34),(237,30),(264,49)]:
        a.rect(x,y,15,11,"deep")
        a.rect(x+1,y+1,12,8,"paper0")
        a.rect(x+3,y+4,7,1,"gold0")
        a.rect(x+3,y+6,5,1,"gold0")
    a.rect(133,26,86,61,"ink")
    a.rect(136,29,80,54,"blue0")
    a.poly([(137,72),(159,64),(173,46),(181,35),(216,31),(216,83),(137,83)],"beam")
    a.poly([(141,74),(168,55),(187,47),(211,48),(215,83),(141,82)],"wood0")
    a.rect(137,29,78,3,"wood4")
    a.rect(134,32,3,56,"wood2")
    a.rect(216,32,2,56,"wood3")
    lantern(a,142,42)
    a.rect(170,37,35,9,"deep")
    a.rect(172,38,31,6,"wood2")
    for x in [175,179,184,188,195,199]:
        a.rect(x,40,2,2,"paper0")
    floor(a,[(0,102),(320,101),(320,144),(0,144)])
    a.poly([(18,106),(93,105),(118,133),(39,138),(9,130)],"red0")
    a.line(22,108,91,107,"red2")
    a.line(37,134,111,130,"red2")
    a.rect(0,74,21,61,"ink")
    a.rect(5,77,14,55,"blue1")
    a.line(18,77,18,130,"wood3")
    a.rect(285,61,34,54,"deep")
    a.rect(289,66,31,49,"blue0")
    a.line(290,66,316,66,"wood4")
    a.line(290,68,290,116,"wood3")
    a.poly([(286,115),(320,112),(320,126),(285,127)],"wood1")
    barrel(a,239,87,20,26)
    crate(a,41,80,22,23)
    crate(a,60,88,35,25)
    a.poly([(125,85),(216,84),(226,91),(131,94)],"wood4")
    a.poly([(130,92),(225,90),(224,107),(131,111)],"beam")
    a.line(132,95,224,94,"wood2")
    a.rect(138,87,13,2,"paper2")
    a.rect(141,86,8,1,"paper1")
    a.rect(157,84,5,4,"red0")
    a.rect(158,82,3,3,"red2")
    return a

def warehouse():
    a = Canvas(fill="ink")
    water(a, 74, 264)
    wall(a,0,0,195,90)
    a.poly([(0,0),(322,0),(320,11),(283,17),(222,14),(143,20),(66,15),(0,27)],"ink")
    a.line(0,25,143,18,"roof3")
    a.line(144,18,315,11,"roof2")
    for x in [14,91,189,272]:
        a.poly([(x,12),(x+8,13),(x+14,139),(x+5,144)],"deep")
        a.line(x+9,15,x+15,142,"roof3")
    for x,y in [(30,32),(78,45),(122,29),(166,33)]:
        a.line(x,y,x+25,y-3,"blue3")
    a.rect(0,54,25,45,"ink")
    a.rect(0,57,19,41,"gold0")
    a.poly([(0,71),(15,67),(17,98),(0,98)],"wood2")
    lantern(a,53,39)
    a.line(202,20,205,132,"iron0")
    a.line(203,20,206,132,"iron2")
    a.line(239,19,242,133,"iron0")
    a.line(240,20,243,133,"iron1")
    a.poly([(0,97),(194,95),(196,108),(0,126)],"ink")
    floor(a,[(0,85),(192,82),(196,99),(0,105)],"roof1","roof0","roof3")
    a.line(0,104,194,98,"roof3")
    for x in range(9,182,24):
        a.line(x,105,x+5,144,"roof0")
        a.line(x+2,105,x+8,144,"roof2")
    floor(a,[(245,121),(320,116),(320,140),(241,142)],"roof1","roof0","roof3")
    a.line(248,121,319,116,"blue4")
    a.line(246,138,319,136,"blue3")
    a.poly([(276,118),(300,111),(320,106),(320,132),(304,139),(281,135)],"deep")
    a.poly([(281,119),(304,113),(320,110),(320,123),(308,129),(285,128)],"red0")
    a.line(283,119,318,112,"wood4")
    a.rect(272,122,3,18,"ink")
    a.rect(274,123,2,16,"roof3")
    for x,y in [(180,72),(254,105)]:
        a.poly([(x,y),(x+11,y-2),(x+13,y+10),(x+1,y+12)],"ink")
        a.rect(x+2,y+1,9,8,"iron2")
        a.rect(x+4,y+2,5,5,"ink")
        a.dot(x+2,y+8,"iron3")
        a.dot(x+9,y+1,"iron3")
    return a

def crossing():
    a = Canvas()
    water(a, 67, 244)
    a.poly([(0,124),(30,117),(154,114),(294,109),(320,111),(320,144),(0,144)],"deep")
    floor(a,[(0,124),(29,118),(151,115),(297,110),(320,113),(320,141),(0,144)])
    a.line(0,124,298,110,"wood4")
    for x,y in [(4,122),(31,118),(81,116),(145,114),(247,109),(297,109)]:
        a.rect(x,y-14,4,15,"deep")
        a.rect(x+1,y-15,1,15,"wood3")
    a.line(4,111,147,101,"wood0")
    a.line(146,101,298,94,"wood0")
    a.rect(208,26,6,92,"beam")
    a.rect(209,26,1,91,"wood4")
    a.line(211,31,306,105,"wood2")
    a.poly([(214,31),(277,46),(315,77),(312,87),(275,76),(218,78)],"red0")
    a.poly([(216,33),(276,47),(311,77),(275,70),(219,74)],"red1")
    a.poly([(225,38),(249,44),(269,66),(226,72)],"red2")
    a.line(215,73,311,83,"red3")
    a.line(75,23,6,122,"iron0")
    a.line(74,23,105,112,"iron0")
    barrel(a,278,107,18,24)
    lantern(a,205,94)
    return a

def sprites():
    a = Canvas(160,112,fill=None)
    rects = {}
    def region(name,x,y,w,h):
        rects[name] = [x,y,w,h]
    for i in range(4):
        x = i*26
        for who,y in [("skipper",0),("clerk",44)]:
            region(f"{who}{i}",x,y,25,42)
            suit = ("green0","green1","green2","green3") if who=="skipper" else ("shirt0","shirt1","shirt2","white")
            a.poly([(x+6,y+15),(x+16,y+15),(x+21,y+23),(x+20,y+33),(x+15,y+35),(x+17,y+39),(x+11,y+41),(x+3,y+41),(x+3,y+37),(x+7,y+34),(x+3,y+29),(x+3,y+22)],"ink")
            a.poly([(x+7,y+16),(x+15,y+15),(x+18,y+21),(x+17,y+31),(x+14,y+34),(x+7,y+33),(x+4,y+29),(x+5,y+21)],suit[1])
            a.poly([(x+7,y+18),(x+9,y+18),(x+9,y+29),(x+6,y+30),(x+5,y+25)],suit[2])
            a.rect(x+10,y+17,3,11,suit[0])
            a.rect(x+8,y+31,5,6,"iron1")
            a.rect(x+13,y+31,3,5,"iron0")
            a.line(x+5,y+39,x+10,y+39,"iron2")
            a.poly([(x+7,y+6),(x+16,y+6),(x+17,y+10),(x+20,y+11),(x+20,y+13),(x+17,y+13),(x+16,y+17),(x+10,y+18),(x+6,y+15),(x+6,y+9)],"skin0")
            a.poly([(x+9,y+7),(x+16,y+7),(x+17,y+11),(x+19,y+12),(x+16,y+13),(x+16,y+16),(x+10,y+17),(x+8,y+14)],"skin1")
            a.rect(x+10,y+9,5,3,"skin2")
            a.rect(x+14,y+10,2,1,"eye")
            a.dot(x+15,y+10,"ink")
            a.rect(x+14,y+14,3,1+i%2,"deep")
            if who=="skipper":
                a.poly([(x+4,y+6),(x+7,y+1),(x+13,y),(x+17,y+3),(x+18,y+6),(x+22,y+7),(x+22,y+8),(x+3,y+8)],"iron0")
                a.line(x+6,y+5,x+17,y+5,"gold1")
                a.rect(x+13,y+13,3,1,"paper0")
                a.rect(x+11,y+15,4,2,"paper1")
                a.line(x+16,y+23,x+20,y+27-i//2,"skin1")
                a.rect(x+19,y+25-i//2,5,5,"iron2")
                a.rect(x+19,y+25-i//2,5,1,"iron3")
                a.dot(x+24,y+26-i//2,"iron3")
            else:
                a.rect(x+7,y+4,10,4,"iron0")
                a.rect(x+10,y+3,6,1,"iron2")
                a.rect(x+11,y+11,7,1,"gold4")
                a.rect(x+12,y+12,1,1,"ink")
                a.rect(x+17,y+12,1,1,"ink")
                a.line(x+14,y+23,x+19,y+27,"skin1")
                a.rect(x+18,y+25-i//2,4,3,"red2")
    for i in range(3):
        x=104+i*17
        region(f"crab{i}",x,1,16,10)
        a.paint(x,1,(".r...........r..",".br.........rb..","..br.RRRRR.rb...","....RRrrRRR.....","...rRRR.RRRr....","..r..rrrrr..r...","..R.R.R.R.R.R...","...r.......r...."),{"r":"red2","R":"red3","b":"red0"})
        a.dot(x+7+i,3,"eye")
    for i in range(2):
        x=104+i*27
        region(f"crate{i}",x,15,26,27)
        crate(a,x,15,23,26,"6" if i==0 else "9")
        region(f"open{i}",x,44,26,27)
        crate(a,x,44,23,26,"6" if i==0 else "9",True)
    region("lift",0,89,52,19)
    a.poly([(0,98),(7,93),(50,93),(51,99),(50,103),(0,104)],"ink")
    a.poly([(1,98),(7,94),(48,94),(49,98),(48,101),(1,101)],"wood3")
    for x in range(3,47,6):
        a.line(x,98,x+4,95,"wood0")
    a.rect(1,101,49,3,"beam")
    a.line(1,100,49,99,"wood4")
    a.rect(2,90,3,13,"iron1")
    a.rect(47,89,3,13,"iron1")
    a.line(3,90,48,90,"iron2")
    region("beam",54,89,37,12)
    a.poly([(54,92),(82,89),(91,92),(90,98),(57,101),(54,98)],"deep")
    a.line(56,92,86,91,"roof3")
    a.line(57,95,89,94,"roof2")
    region("rope",54,101,23,11)
    a.line(54,102,75,111,"deep")
    a.line(54,101,76,110,"wood4")
    a.line(54,101,61,104,"paper0")
    region("shutter",96,88,55,24)
    a.rect(96,88,55,24,"beam")
    for y in range(89,112,4):
        a.rect(96,y,55,1,"wood3")
        a.rect(96,y+2,55,1,"deep")
    a.rect(122,107,6,2,"iron3")
    region("leak0",104,73,12,11)
    a.line(104,75,108,78,"sea4")
    a.line(108,78,112,82,"foam")
    a.dot(113,83,"blue5")
    region("leak1",117,73,12,11)
    a.line(117,75,122,77,"foam")
    a.line(122,78,126,81,"sea4")
    a.dot(127,83,"foam")
    region("patch",130,73,12,11)
    a.rect(130,74,4,4,"wood2")
    a.dot(130,74,"wood4")
    a.dot(133,77,"deep")
    return a, rects

def main():
    skill, out, preview = (Path(p).resolve() for p in sys.argv[1:])
    out.mkdir(parents=True, exist_ok=True)
    preview.mkdir(parents=True, exist_ok=True)
    preview = Path(tempfile.mkdtemp(prefix="proof-", dir=preview))
    atlas, rects = sprites()
    drawings = [("cargo-office",entrance()),("clerk",office()),("warehouse",warehouse()),("crossing",crossing()),("sprites",atlas)]
    index = {value: i + 32 for i, value in enumerate(PALETTE.values())}
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
        + json.dumps(rgb) + ";\nexport const atlas = " + json.dumps(rects) + " as const;\n",encoding="utf-8")
    print(preview)

if __name__ == "__main__":
    main()
