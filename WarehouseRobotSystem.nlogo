; ============================================================
;  WAREHOUSE ROBOT SIMULATION SYSTEM
;  Agent-Based Systems - Final Year Project
;  NetLogo 6.4 compatible
; ============================================================

breed [ robots robot ]

globals [
  total-items-delivered
  total-collisions-avoided
  scenario-label
]

robots-own [
  battery-level
  carrying-item?
  task-count
  collisions-avoided
  robot-state
  stuck-timer
  target-patch
]

patches-own [
  patch-type
  item-count
  restock-timer
  items-packed
  congestion-heat
]

to setup
  clear-all
  set total-items-delivered    0
  set total-collisions-avoided 0
  set scenario-label "Custom"
  setup-patches
  setup-robots
  reset-ticks
end

to setup-patches
  ask patches [
    set patch-type      "aisle"
    set item-count      0
    set restock-timer   0
    set items-packed    0
    set congestion-heat 0
    set pcolor 46
  ]
  ask patches with [ pxcor < (min-pxcor + 9) and (pycor mod 3 = 0) ] [
    set patch-type "shelf"
    set item-count 5
    set pcolor 35
  ]
  ask patches with [ pxcor > (max-pxcor - 9) and (pycor mod 4 = 0) ] [
    set patch-type "packing"
    set pcolor 64
  ]
  ask patches with [ pxcor = 0 and (pycor > (max-pycor - 3) or pycor < (min-pycor + 3)) ] [
    set patch-type "charger"
    set pcolor yellow
  ]
  let aisle-patches patches with [ patch-type = "aisle" ]
  ask n-of (min (list num-obstacles (count aisle-patches - num-robots * 2))) aisle-patches [
    set patch-type "obstacle"
    set pcolor 25
  ]
end

to setup-robots
  create-robots num-robots [
    let sp patches with [ patch-type = "aisle" ]
    if any? sp [ move-to one-of sp ]
    set shape "circle"
    set size  0.8
    set color violet
    set battery-level      battery-capacity
    set carrying-item?     false
    set task-count         0
    set collisions-avoided 0
    set robot-state        "fetch"
    set stuck-timer        0
    let ns min-one-of (patches with [ patch-type = "shelf" and item-count > 0 ]) [ distance myself ]
    ifelse ns != nobody [ set target-patch ns ] [ set target-patch nobody ]
    if target-patch != nobody [ face target-patch ]
  ]
end

to go
  ask robots [
    robot-decide
    robot-move
    robot-act
  ]
  restock-shelves
  decay-congestion
  if show-heatmap? [ update-heatmap ]
  tick
end

to robot-decide
  if battery-level < low-battery-threshold or (robot-state = "charge" and battery-level < battery-capacity) [
    let nc min-one-of (patches with [ patch-type = "charger" ]) [ distance myself ]
    set target-patch nc
    set robot-state "charge"
    set color orange
    stop
  ]
  if carrying-item? [
    let np min-one-of (patches with [ patch-type = "packing" ]) [ distance myself ]
    set target-patch np
    set robot-state "deliver"
    set color red
    stop
  ]
  let avail patches with [ patch-type = "shelf" and item-count > 0 ]
  ifelse any? avail [
    set target-patch min-one-of avail [ distance myself ]
    set robot-state "fetch"
    set color violet
  ] [
    set target-patch nobody
    set robot-state "fetch"
    set color gray
  ]
end

to robot-move
  if target-patch = nobody [
    rt random 60 - 30
    forward robot-speed * 0.3
    set stuck-timer 0
    stop
  ]
  face target-patch
  let robots-ahead other robots in-cone 1.5 60
  let nxt patch-ahead 1
  let blocked? (nxt = nobody or [patch-type] of nxt = "obstacle")
  ifelse (any? robots-ahead) or blocked? [
    rt 45 + random 90
    set collisions-avoided       collisions-avoided + 1
    set total-collisions-avoided total-collisions-avoided + 1
    set stuck-timer stuck-timer + 1
  ] [
    let speed-mult ifelse-value (battery-level <= 0) [ 0.2 ] [ 1.0 ]
    forward robot-speed * 0.3 * speed-mult
    set stuck-timer max (list 0 (stuck-timer - 1))
  ]
  if stuck-timer > 60 [
    let nearby patches with [ patch-type = "aisle" and distance myself < 6 ]
    let dest nobody
    ifelse any? nearby [ set dest one-of nearby ] [ set dest one-of patches with [ patch-type = "aisle" ] ]
    if dest != nobody [ move-to dest ]
    set stuck-timer 0
  ]
  set battery-level max (list 0 (battery-level - 0.1))
  ask patch-here [ set congestion-heat min (list 200 (congestion-heat + 1)) ]
end

to robot-act
  let here patch-here
  if [patch-type] of here = "shelf" and [item-count] of here > 0 and not carrying-item? [
    ask here [ set item-count item-count - 1 ]
    set carrying-item? true
    set shape "box"
  ]
  if [patch-type] of here = "packing" and carrying-item? [
    ask here [ set items-packed items-packed + 1 ]
    set carrying-item?        false
    set task-count            task-count + 1
    set total-items-delivered total-items-delivered + 1
    set shape "circle"
  ]
  if [patch-type] of here = "charger" and battery-level < battery-capacity [
    set battery-level min (list battery-capacity (battery-level + 5))
    if battery-level >= battery-capacity [ set robot-state "fetch" ]
  ]
end

to restock-shelves
  ask patches with [ patch-type = "shelf" and item-count = 0 ] [
    set restock-timer restock-timer + 1
    if restock-timer >= restock-rate [
      set item-count    5
      set restock-timer 0
      set pcolor 35
    ]
  ]
end

to decay-congestion
  ask patches [ set congestion-heat congestion-heat * 0.95 ]
end

to update-heatmap
  ask patches with [ patch-type = "aisle" ] [
    let intensity min (list 1 (congestion-heat / 200))
    set pcolor scale-color red intensity 1.2 -0.2
  ]
end

to reset-heatmap
  ask patches with [ patch-type = "aisle" ] [ set pcolor 46 ]
end

to load-scenario-1
  set num-robots            5
  set robot-speed           1.0
  set battery-capacity      100
  set low-battery-threshold 20
  set num-obstacles         5
  set restock-rate          30
  set scenario-label        "S1: Light Load (5 robots)"
  setup
end

to load-scenario-2
  set num-robots            15
  set robot-speed           1.0
  set battery-capacity      100
  set low-battery-threshold 20
  set num-obstacles         15
  set restock-rate          30
  set scenario-label        "S2: Medium Load (15 robots)"
  setup
end

to load-scenario-3
  set num-robots            30
  set robot-speed           1.0
  set battery-capacity      100
  set low-battery-threshold 20
  set num-obstacles         20
  set restock-rate          30
  set scenario-label        "S3: Peak Load (30 robots)"
  setup
end

to-report avg-battery
  ifelse any? robots [ report mean [ battery-level ] of robots ] [ report 0 ]
end

to-report robots-fetching
  report count robots with [ robot-state = "fetch" ]
end

to-report robots-delivering
  report count robots with [ robot-state = "deliver" ]
end

to-report robots-charging
  report count robots with [ robot-state = "charge" ]
end

to-report throughput-rate
  if ticks = 0 [ report 0 ]
  report (total-items-delivered / ticks) * 100
end

to-report fleet-efficiency
  if count robots = 0 [ report 0 ]
  report ((robots-fetching + robots-delivering) / count robots) * 100
end
@#$#@#$#@
GRAPHICS-WINDOW
220
10
748
539
-1
-1
13.0
1
10
1
1
1
0
0
0
1
-20
20
-20
20
0
0
1
ticks
30.0

BUTTON
10
10
105
43
NIL
setup
NIL
1
T
OBSERVER
NIL
NIL
NIL
NIL
1

BUTTON
115
10
205
43
go
go
T
1
T
OBSERVER
NIL
NIL
NIL
NIL
0

SLIDER
10
55
210
88
num-robots
num-robots
1
50
10.0
1
1
NIL
HORIZONTAL

SLIDER
10
95
210
128
robot-speed
robot-speed
0.5
3.0
1.0
0.1
1
NIL
HORIZONTAL

SLIDER
10
135
210
168
battery-capacity
battery-capacity
50
200
100.0
10
1
NIL
HORIZONTAL

SLIDER
10
175
210
208
low-battery-threshold
low-battery-threshold
5
50
20.0
1
1
NIL
HORIZONTAL

SLIDER
10
215
210
248
num-obstacles
num-obstacles
0
40
10.0
1
1
NIL
HORIZONTAL

SLIDER
10
255
210
288
restock-rate
restock-rate
5
100
30.0
5
1
ticks
HORIZONTAL

SWITCH
10
300
210
333
show-heatmap?
show-heatmap?
1
1
-1000

BUTTON
10
345
210
378
Load Scenario 1 - 5 robots
load-scenario-1
NIL
1
T
OBSERVER
NIL
NIL
NIL
NIL
1

BUTTON
10
385
210
418
Load Scenario 2 - 15 robots
load-scenario-2
NIL
1
T
OBSERVER
NIL
NIL
NIL
NIL
1

BUTTON
10
425
210
458
Load Scenario 3 - 30 robots
load-scenario-3
NIL
1
T
OBSERVER
NIL
NIL
NIL
NIL
1

MONITOR
760
10
940
55
Items Delivered
total-items-delivered
0
1
11

MONITOR
760
60
940
105
Collisions Avoided
total-collisions-avoided
0
1
11

MONITOR
760
110
940
155
Avg Battery
avg-battery
1
1
11

MONITOR
760
160
850
205
Fetching
robots-fetching
0
1
11

MONITOR
855
160
940
205
Delivering
robots-delivering
0
1
11

MONITOR
760
210
940
255
Robots Charging
robots-charging
0
1
11

MONITOR
760
260
940
305
Fleet Efficiency %
fleet-efficiency
1
1
11

MONITOR
760
310
940
355
Throughput per 100 ticks
throughput-rate
2
1
11

MONITOR
760
360
940
405
Scenario
scenario-label
0
1
11

PLOT
760
415
1100
600
Warehouse Performance
Ticks
Value
0.0
100.0
0.0
50.0
true
true
"" ""
PENS
"Items Delivered" 1.0 0 -13791810 true "" "plot total-items-delivered"
"Collisions Avoided" 1.0 0 -2674135 true "" "plot total-collisions-avoided"
"Avg Battery" 1.0 0 -14835848 true "" "plot avg-battery"
"Robots Charging" 1.0 0 -955883 true "" "plot robots-charging"
@#$#@#$#@
## WAREHOUSE ROBOT SIMULATION

### What is it?
A multi-agent warehouse simulation where autonomous robots pick up items from shelves and deliver them to packing stations while managing battery levels.

### How to use
1. Set sliders to configure the simulation.
2. Click Setup to initialise the warehouse.
3. Click Go to start the simulation.
4. Use Scenario buttons to load preset configurations.

### Robot States
- Violet: Fetching items from shelves
- Red: Delivering items to packing stations
- Orange: Going to charge

### Scenarios
- S1: 5 robots, 5 obstacles
- S2: 15 robots, 15 obstacles
- S3: 30 robots, 20 obstacles
@#$#@#$#@
default
true
0
Polygon -7500403 true true 150 5 40 250 150 205 260 250

circle
false
0
Circle -7500403 true true 0 0 300

box
false
0
Polygon -7500403 true true 150 285 285 225 285 75 150 135
Polygon -7500403 true true 150 135 15 75 150 15 285 75
Polygon -7500403 true true 15 75 15 225 150 285 150 135
Line -16777216 false 150 285 150 135
Line -16777216 false 150 135 285 75
Line -16777216 false 150 135 15 75
@#$#@#$#@
NetLogo 6.4.0
@#$#@#$#@
setup
repeat 100 [ go ]
@#$#@#$#@

@#$#@#$#@

@#$#@#$#@

@#$#@#$#@
default
0.0
-0.2 0 0.0 1.0
0.0 1 1.0 0.0
0.2 0 0.0 1.0
link direction
true
0
Line -7500403 true 150 150 90 180
Line -7500403 true 150 150 210 180
@#$#@#$#@
0
@#$#@#$#@
