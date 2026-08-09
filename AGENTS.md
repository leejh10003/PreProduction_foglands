# AGENTS.md

## Project Direction

This is an RPG Maker MV project. The current battle direction is to avoid the default `Scene_Battle` presentation and route battles into a top-view map battle space instead.

The player/hero is the actual combat performer. Companions will eventually act as buffers/promise-givers, not ordinary RPG party actors. Do not push this design back into MV's default actor party, equipment, follower, or battle UI unless explicitly asked.

## Files To Watch

Focus on these files for the current battle prototype:

- `data/FogCards.json`
- `js/plugins/Foglands_Cards.js`
- `js/plugins/Foglands_Combat.js`
- `js/plugins/Foglands_MapBattle.js`
- `js/plugins/ScreenFilter.js`
- `js/plugins.js`
- `data/Map002.json`
- `data/Map003.json`
- `test/Foglands_Combat.test.js`
- `progress.md`

Avoid editing core MV engine files such as `js/rpg_objects.js`, `js/rpg_scenes.js`, `js/rpg_managers.js`, or `js/rpg_sprites.js`. Prefer plugin overrides.

## Documentation Boundaries

Keep this file focused on durable architecture, behavioral contracts, file
ownership, and implementation rules. Store time-sensitive project tracking in
`progress.md`, including:

- Work in progress and partially implemented features.
- Completed work and verification results.
- Change history.
- Planned next steps.
- Cancelled, reverted, deferred, or superseded approaches.

When implementation status changes, update `progress.md`. Update this file only
when an architectural decision, public contract, file responsibility, or
standing implementation rule changes.

## Foglands_MapBattle.js

`js/plugins/Foglands_MapBattle.js` is the current bridge from default MV battle calls to the top-view battle map.

Responsibilities and behavior:

- Overrides event command `Battle Processing` (`command301`) so it does not push `Scene_Battle`.
- Overrides random encounter handling on `Scene_Map`.
- Stores battle context in `$gameSystem._foglandsMapBattle`.
- Transfers the player to the configured battle map.
- On battle map start, assigns enemy sprites to tagged map events.
- Opens battle card selection, confirms player/fog picks, and creates the final 10-card deck.
- Calls the pure combat resolver once and stores its complete result in save-backed state.
- Shows player/card and friendly-buff action names at bottom-left and enemy action names at bottom-right without using MV's message window.
- Plays configured action animations and signed HP-change popups, then waits 30 frames before advancing to the next action.
- Adds sprite-only attack lunges, hit recoil/red pulses, and self-buff blue pulses without changing map coordinates.
- Displays timeline-synchronized HP bars and current/max HP numbers above the hero and each instantiated enemy map sprite.
- Dissolves newly defeated hero/enemy sprites over 30 frames and keeps them hidden for the rest of playback.
- Applies the final hero HP once, reserves transfer to the origin map, and restores the pre-battle player/follower formation after transfer.

Battle context contract:

```js
$gameSystem._foglandsMapBattle = {
    active: true,
    troopId: troopId,
    canEscape: Boolean,
    canLose: Boolean,
    source: "event" | "encounter",
    phase: "transfer" | "selection" | "combat" | "result" | "returning",
    playerPicks: [cardUid],
    fogPicks: [cardUid],
    battleDeck: [cardUid],
    mods: {},
    combatSeed: Number,
    combat: Object | null,
    returnState: {
        mapId: Number,
        x: Number,
        y: Number,
        direction: Number,
        followersVisible: Boolean,
        followers: [{
            index: Number,
            actorId: Number,
            x: Number,
            y: Number,
            direction: Number
        }]
    }
};
```

`FoglandsMapBattle.runPhase(phase)` is the phase dispatcher. The initial map
transfer resumes into `selection`; confirming a valid card selection snapshots
the player picks, random fog picks, and final 10-card deck, then advances to
`combat`. Entering combat calls `FoglandsCombat.resolve(input)` once, stores the
returned result, and plays action-bearing timeline events through map sprites.
Non-action log events remain in the result but are skipped by the current visual
player.

The saved combat state lives at:

```js
$gameSystem._foglandsMapBattle.combat = {
    version: 1,
    status: "playing" | "finished",
    input: {},
    result: {
        outcome: {},
        finalState: {},
        stats: {},
        timeline: []
    },
    playback: {
        index: Number,
        pending: Boolean,
        nextIndex: Number,
        animationPending: Boolean,
        animationEventIndex: Number,
        animationNextIndex: Number,
        valuePopupPending: Boolean,
        choreographyPending: Boolean,
        defeatPending: Boolean,
        actionPending: Boolean,
        pauseFrames: Number
    },
    outcomeApplied: Boolean
};
```

Do not store authoritative combat progress in plugin-local variables. The
stored result prevents random rolls from changing after a scene recreation or
save load, and `outcomeApplied` prevents HP/results from being applied twice.

## Foglands_Combat.js

`js/plugins/Foglands_Combat.js` is the engine-independent battle calculator.

Public contract:

```js
FoglandsCombat.resolve(input) -> result
```

Resolver behavior:

- Synchronous full-battle resolution, up to 28 turns.
- Draw 5, automatically use 3, discard the rest, and reshuffle as needed.
- Seeded random card order and success rolls.
- Supports all effect codes currently present in `FogCards.json`.
- For multi-enemy Troops, cards target the first living enemy and every living
  enemy attacks in Troop order.
- Returns structured `outcome`, `finalState`, `stats`, and `timeline` data.
- Adds serializable animation metadata to card-effect and enemy-attack timeline events.
- Adds serializable signed `hpChange` metadata to damage, healing, poison tick, enemy attack, and thorn-reflection events.
- Adds serializable `choreography` metadata for attacks, hit reactions, and friendly self-buffs.
- Adds serializable `defeats` metadata exactly when a hero or enemy changes from positive HP to zero HP.
- Represents card probability resolution with a `cardUse` event and
  `successType: "success" | "miss"`; effect types such as `heal`, `block`,
  and `damage` remain separate successful effect events.
- Failed healing, defense, and other non-attack cards do not create effect
  animations, HP changes, or movement. Failed attack cards may lunge toward
  their intended enemy but do not animate, damage, recoil, or tint the target.
- Does not access `$gameSystem`, `$gameMap`, scenes, windows, or sprites.
- Does not retain combat state between calls.

The current input builder uses the party leader's current HP/max HP and MV
Enemy database `params[0]` (HP) / `params[2]` (ATK). Database values are the
active balance source; the prototype scaling formulas are reference material,
not active combat code.

`FoglandsMapBattle.returnToOrigin()` changes the phase to `returning` and
reserves the origin transfer without clearing the battle context. MV's transfer
first synchronizes followers onto the player, so `restoreOriginFormation()`
runs from the destination `Scene_Map.start`, restores saved follower positions,
then clears the battle context. Do not clear it before destination restoration.

### Plugin Parameters

`js/plugins.js` currently registers:

```json
{"name":"Foglands_MapBattle","status":true,"parameters":{"Battle Map Id":"2","Battle X":"4","Battle Y":"13"}}
```

This means battles transfer to `Map002` at `(4, 13)`. If these values are changed in RPG Maker MV's Plugin Manager, `js/plugins.js` will be regenerated.

### Enemy Sprite Mapping

Enemy database records do not have map character sprites by default. The current convention is to add note tags on each enemy:

```text
<FogChar:Monster>
<FogCharIndex:0>
```

`Foglands_MapBattle.js` reads these from `$dataEnemies[enemyId].meta`.

Supported tag names:

- `FogChar` or `FogCharacter`
- `FogCharIndex` or `FogCharacterIndex`

Enemy attacks use animation 1 by default. Override the attack animation through
the Enemy database note box:

```text
<FogAttackAnimation:6>
<FogAttackName:할퀴기>
```

`FogAnimation` is also accepted as a shorter alias. Cards already define the
same static `animationId` field in `FogCards.json`. An `animationId` of `0`
means no animation. Do not copy this field into runtime card instances.
`FogActionName` is accepted as an alias for `FogAttackName`; without either
name tag, enemy actions display as `<enemy name>의 공격`.

Card actions, enemy attacks, and future companion-provided actions share this
definition contract in normalized combat input:

```js
{
    actionName: String,
    animationId: Number,
    displaySide: "left" | "right"
}
```

Displayable action timeline events may carry:

```js
animation: {
    animationId: Number,
    targetType: "hero" | "enemy",
    targetId: Number
}
```

Action ownership and label placement use:

```js
actionLabel: {
    text: String,
    side: "left" | "right"
}
```

Cards and future friendly companion buffs default to `left`; enemies default
to `right`.

Movement, glow, and buff sound presentation use:

```js
choreography: {
    type: "attack" | "hit" | "buff",
    source: { targetType: "hero" | "enemy", targetId: Number },
    target: { targetType: "hero" | "enemy", targetId: Number },
    hit: Boolean,
    glow: "red" | "blue",
    se: { name: String, volume: Number, pitch: Number, pan: Number }
}
```

Fields not relevant to a choreography type may be omitted. Attack motion lasts
18 frames: the source moves up to 18 pixels toward the target and returns. A
hit target moves up to 10 pixels away from the source, returns, and receives a
red blend pulse. Hit-only effects such as poison tick, thorn reflection, and
self-damage use the same recoil/red pulse without a source lunge. A missed attack card lunges but does not animate, recoil, or tint the target.
Missed self-target and non-attack cards remain stationary and show no effect
animation.

Friendly self-buffs, including block, healing, retained/permanent block, draw,
and probability buffs, stay in place and receive a 24-frame blue blend pulse.
They play `Heal1` once with `volume: 90`, `pitch: 140`, and `pan: 0`.
Choreography changes only `Sprite_Character` display coordinates and blend
color; it must restore both after completion and must not move map characters.

New defeat transitions use:

```js
defeats: [{
    targetType: "hero" | "enemy",
    targetId: Number
}]
```

The renderer fades each defeated `Sprite_Character` from its current opacity to
zero over 30 frames. This runs alongside the action animation, HP popup, and
choreography. The map character's authoritative opacity is not changed. Since
MV refreshes sprite opacity from the character each frame, the 0-HP HP-bar
state enforces zero sprite opacity after the dissolve completes and after scene
recreation. A new map scene restores normal opacity automatically.

### Map HP Bars

`Foglands_MapBattle` creates one world-space HP bar for the hero and one for
each enemy in `combat.input.enemies` when combat begins. Enemy bars resolve by
the same `instanceId` used for enemy display slots.

Current visual rules:

- 52x7-pixel inner bar with a 2-pixel dark border.
- A transparent 76-pixel text area to the right shows `current HP / max HP` in
  16-pixel outlined text.
- The combined bitmap uses a corrected anchor so the bar itself, rather than
  the bar-plus-text group, remains centered over the character.
- Positioned 8 pixels above the rendered character sprite's head.
- Follows the final `Sprite_Character` position every frame, including lunge
  and recoil offsets.
- Green above 50%, yellow above 25%, and red at 25% or below.
- Fades with its character during the 30-frame defeat dissolve and is hidden at
  0 HP for the rest of battle playback.

Initial values come from `combat.input`. Each action applies its serialized
timeline `state` snapshot before presentation begins. On scene recreation or
save load, the current playback cursor is used to reconstruct the last visible
HP state. Bars are visual-only plugin-local sprites and are removed before the
return transfer; authoritative HP remains in the saved combat result.

Events that change HP may also carry the presentation-independent field:

```js
hpChange: {
    amount: Number,
    targetType: "hero" | "enemy",
    targetId: Number
}
```

Positive `amount` values heal and negative values deal damage. Zero changes do
not create this field, so fully blocked attacks and ineffective healing do not
show `+0` or `-0`.

`Foglands_MapBattle` resolves `hero` to `$gamePlayer` and `enemy` to the
pre-placed enemy slot matching the enemy `instanceId`. It requests the map
character animation and shows the action name without opening an MV message.
For `hpChange`, it also creates a number above the target character. The number
rises 28 pixels and fades out over 30 frames (about 0.5 seconds at 60 FPS).
Healing uses a sky-blue/white gradient with a `+` sign; damage uses a
red/white gradient with a `-` sign. After the configured action animation and
HP popup finish, playback holds for 30 frames before advancing.

Action labels are unboxed text with 50-pixel horizontal and bottom margins.
Left actions anchor at `(50, Graphics.boxHeight - 50)`; right actions anchor at
`(Graphics.boxWidth - 50, Graphics.boxHeight - 50)`.

If a troop member is hidden, missing, or lacks these tags, its display slot is made transparent.

## Map002.json

`data/Map002.json` is the current battle map.

It contains pre-placed enemy display slot events. These are intentionally normal MV map events, not dynamically created events.

Enemy slot event convention:

```text
<FogEnemySlot:n>
```

Current slots:

- `FogEnemySlot1` at `(11, 10)`
- `FogEnemySlot2` at `(15, 11)`
- `FogEnemySlot3` at `(13, 12)`
- `FogEnemySlot4` at `(15, 13)`
- `FogEnemySlot5` at `(11, 14)`
- `FogEnemySlot6` at `(13, 15)`

When a troop is routed into the battle map, troop members are assigned to these slots in numeric order.

There is also an `EV007` currently present at `(3, 9)`. Do not assume Map002 only contains enemy slots.

## Map003.json

`data/Map003.json` is the city map (`MapInfos.json` names map 3 as `시가지`). It currently has 27 events and appears to be the main authored map space.

Treat Map003 as user-authored content. Do not rewrite or regenerate it mechanically. If a battle starts from this map, `Foglands_MapBattle` stores the return position before transferring to Map002.

## ScreenFilter.js

`js/plugins/ScreenFilter.js` is a custom screen filter plugin. It supports plugin commands such as:

```text
ScreenFilter on
ScreenFilter off
ScreenFilter contrast 1.25 saturation 0.8 brightness 0.95
ScreenFilter contrast 3 saturation 0.0 brightness 0.95 tintRed 255 tintGreen 220 tintBlue 170 tintStrength 0.7
```

It hooks `Scene_Map.prototype.start` and applies the filter when enabled. `Foglands_MapBattle.js` also hooks `Scene_Map.prototype.start`, so preserve aliasing patterns when editing either plugin:

```js
var _Scene_Map_start = Scene_Map.prototype.start;
Scene_Map.prototype.start = function() {
    _Scene_Map_start.call(this);
    // plugin work
};
```

Do not replace `Scene_Map.prototype.start` without calling the previous implementation.

## FogCards.json

`data/FogCards.json` is the new static card database. It intentionally lives in `data/` because cards are game data, analogous to MV's `Skills.json` and `Items.json`, but should not be implemented as either default skills or default items.

Current decision:

- Do not reuse MV `Skill` as the card model.
- Do not reuse MV `Item` as the card model.
- Use a separate Foglands card concept, but keep the data shape familiar to MV.

Why not `Skill`:

- Skills are tied to actors, learned skill lists, MP/TP costs, skill types, and default battle command flow.
- The Foglands card loop needs deck construction, duplicate instances, fog-picked cards, curses, reward pools, upgrades, removals, and custom probability handling.

Why not `Item`:

- Items imply inventory quantity, consumable usage, shop/price behavior, and menu usage.
- Foglands cards are deck/collection instances, not ordinary consumable inventory entries.

Current card database shape:

```js
{
    id: 1,
    key: "old_sword",
    name: "낡은 검",
    description: "피해 5",
    iconIndex: 76,
    animationId: 1,
    category: "attack",
    tier: "common",
    successRate: 100,
    effects: [{ code: "damage", value: 5 }],
    note: "<Starter>"
}
```

Current `data/FogCards.json` contains the prototype card set:

- 55 card definitions total.
- `common`: 34
- `uncommon`: 14
- `mythic`: 6
- `curse`: 1

The file is a static definition table only. Duplicate ownership, upgrades, deck selection, and run state should be stored separately as card instances, for example:

```js
{ uid: 1001, cardId: 1, upgraded: false }
```

Do not add duplicate static definitions just because the starting deck contains multiple copies. Starting deck composition should be represented by multiple runtime instances pointing to the same `cardId`.

Card plugin:

- `js/plugins/Foglands_Cards.js`

Responsibilities:

- Load `data/FogCards.json` into a global such as `$dataFogCards`.
- Parse card note tags.
- Provide an MV-window card listing interface.
- Create the prototype starter card collection as runtime instances in `$gameSystem._fogCardInstances`.
- Store selected runtime card uids in `$gameSystem._fogSelectedCardUids`.
- Toggle card selection with OK/Enter in the card list.
- Show selected rows with `(선택)` text.
- Display each row as a card instance, including `#uid`, so duplicate cards are listed separately.
- Enforce `Max Selection` with queue behavior: selecting beyond the cap removes the oldest selected card.
- Reject curse cards from player selection.
- When opened during map-battle `selection`, require 7 player cards (or 6 with `foghand`).
- Provide a battle-only deck confirmation command.
- Preserve the previous valid selection when the battle selection scene is recreated.
- Open the card list with plugin command `FogCards open` or `FogCards list`.
- Clear selection with plugin command `FogCards clear`.
- Reset the starter runtime collection with plugin command `FogCards reset`.

Time-sensitive remaining card-system work is tracked in `progress.md`.

## plugins.js

`js/plugins.js` is generated by RPG Maker MV. Manual edits can be overwritten when the Plugin Manager is saved.

Required plugin order:

1. `MadeWithMv`
2. `ScreenFilter`
3. `Foglands_Cards`
4. `Foglands_Combat`
5. `Foglands_MapBattle`
6. `Community_Basic`

If combat confirmation only plays the buzzer, check this file first. A missing
or disabled `Foglands_Combat` causes `FoglandsMapBattle.startCombat()` to return
`false`. Because MV regenerates `plugins.js`, register and enable the plugin in
MV's Plugin Manager rather than relying only on a manual edit.

## Implementation Rules

- Keep the default MV battle UI out of the Foglands combat flow.
- Use Troop as encounter composition data.
- Use Enemy note tags for map sprite identity.
- Use pre-placed battle map events as display slots.
- Use `data/FogCards.json` for card definitions instead of MV's default Skill or Item databases.
- Keep static card definitions separate from runtime card instances.
- Do not dynamically create map events unless the user explicitly chooses that direction.
- Do not put companions into `$gameParty` as normal actors for this system yet.
- Prefer data-driven tags and plugin-level state over edits to engine core files.

## Battle Loop Decisions

Battle design decisions:

- For now, ignore deployed companion implementation and focus on battle triggering into card selection.
- The first interaction after battle trigger should be choosing the player's battle "hand/deck" (`패`) before the actual fight resolves.
- The hero is the combat performer.
- Companions will later be buffers who promise effects. Betrayal means a promised buff is missing or distorted. Purification restores the companion to a normal buffer.
- Combat itself may remain automatic or semi-automatic. The fight is not only a damage exchange; it is also an evidence generator for post-battle betrayal deduction.

Core flow contract:

```text
Map battle trigger
-> store troopId and return position
-> transfer to Map002
-> populate enemy slot events from troop members
-> choose cards / deck / hand
-> resolve top-view battle
-> play action labels, sprite choreography, map animations, and HP popups with 30-frame pauses
-> apply final hero HP
-> reserve return transfer
-> restore player/follower formation on the origin map
-> clear the active battle context
```

## Progress Tracking

See `progress.md` for current work, completed work, partial and planned
features, verification status, change history, and cancelled or superseded
approaches.
