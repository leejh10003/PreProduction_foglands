/*:
 * @plugindesc Routes RPG Maker MV battles into a top-view map battle space.
 * @author Codex
 *
 * @param Battle Map Id
 * @type number
 * @min 1
 * @default 2
 *
 * @param Battle X
 * @type number
 * @min 0
 * @default 8
 *
 * @param Battle Y
 * @type number
 * @min 0
 * @default 6
 *
 * @help
 * Foglands_MapBattle
 *
 * This is the first bridge for the Foglands battle flow.
 * It prevents the default Scene_Battle from opening and transfers the
 * player to a configured top-view battle map instead.
 *
 * Current scope:
 * - Event command "Battle Processing" is routed to the battle map.
 * - Random encounters are routed to the battle map.
 * - The triggered troop and return position are stored on $gameSystem.
 * - Enemy slot events tagged with <FogEnemySlot:n> are assigned sprites
 *   from enemy note tags:
 *     <FogChar:Monster>
 *     <FogCharIndex:0>
 *
 * This plugin does not run the custom battle simulation yet.
 */

(function() {
    'use strict';

    var pluginName = 'Foglands_MapBattle';
    var params = PluginManager.parameters(pluginName);
    var battleMapId = Number(params['Battle Map Id'] || 2);
    var battleX = Number(params['Battle X'] || 8);
    var battleY = Number(params['Battle Y'] || 6);

    window.FoglandsMapBattle = window.FoglandsMapBattle || {};

    FoglandsMapBattle.params = function() {
        return {
            battleMapId: battleMapId,
            battleX: battleX,
            battleY: battleY
        };
    };

    FoglandsMapBattle.start = function(troopId, canEscape, canLose, source) {
        var returnState = {
            mapId: $gameMap.mapId(),
            x: $gamePlayer.x,
            y: $gamePlayer.y,
            direction: $gamePlayer.direction()
        };
        $gameSystem._foglandsMapBattle = {
            active: true,
            troopId: troopId,
            canEscape: !!canEscape,
            canLose: !!canLose,
            source: source || 'event',
            returnState: returnState
        };
        $gamePlayer.makeEncounterCount();
        $gamePlayer.reserveTransfer(battleMapId, battleX, battleY, 2, 0);
    };

    FoglandsMapBattle.current = function() {
        return $gameSystem._foglandsMapBattle || null;
    };

    FoglandsMapBattle.clear = function() {
        $gameSystem._foglandsMapBattle = null;
    };

    FoglandsMapBattle.returnToOrigin = function() {
        var state = FoglandsMapBattle.current();
        if (!state || !state.returnState) return;
        var r = state.returnState;
        FoglandsMapBattle.clear();
        $gamePlayer.reserveTransfer(r.mapId, r.x, r.y, r.direction || 2, 0);
    };

    FoglandsMapBattle.isBattleMap = function() {
        return $gameMap && $gameMap.mapId && $gameMap.mapId() === battleMapId;
    };

    FoglandsMapBattle.enemySprite = function(enemyId) {
        var enemy = $dataEnemies[enemyId];
        if (!enemy || !enemy.meta) return null;

        var characterName = enemy.meta.FogChar || enemy.meta.FogCharacter;
        var characterIndex = Number(enemy.meta.FogCharIndex || enemy.meta.FogCharacterIndex || 0);
        if (!characterName) return null;

        return {
            characterName: characterName,
            characterIndex: characterIndex
        };
    };

    FoglandsMapBattle.enemySlotEvents = function() {
        return $gameMap.events().filter(function(event) {
            return event && event.event() && event.event().meta && event.event().meta.FogEnemySlot;
        }).sort(function(a, b) {
            return Number(a.event().meta.FogEnemySlot) - Number(b.event().meta.FogEnemySlot);
        });
    };

    FoglandsMapBattle.clearEnemySlot = function(event) {
        event.setImage('', 0);
        event.setTransparent(true);
    };

    FoglandsMapBattle.applyEnemySlot = function(event, member) {
        if (!member || member.hidden) {
            FoglandsMapBattle.clearEnemySlot(event);
            return;
        }

        var sprite = FoglandsMapBattle.enemySprite(member.enemyId);
        if (!sprite) {
            FoglandsMapBattle.clearEnemySlot(event);
            return;
        }

        event.setImage(sprite.characterName, sprite.characterIndex);
        event.setDirection(2);
        event.setPattern(1);
        event.setTransparent(false);
    };

    FoglandsMapBattle.setupEnemySlots = function() {
        if (!FoglandsMapBattle.isBattleMap()) return;

        var state = FoglandsMapBattle.current();
        var troop = state && $dataTroops[state.troopId];
        var members = troop ? troop.members : [];
        var slots = FoglandsMapBattle.enemySlotEvents();

        slots.forEach(function(event, index) {
            FoglandsMapBattle.applyEnemySlot(event, members[index]);
        });
    };

    // Battle Processing
    Game_Interpreter.prototype.command301 = function() {
        if (!$gameParty.inBattle()) {
            var troopId;
            if (this._params[0] === 0) {
                troopId = this._params[1];
            } else if (this._params[0] === 1) {
                troopId = $gameVariables.value(this._params[1]);
            } else {
                troopId = $gamePlayer.makeEncounterTroopId();
            }
            if ($dataTroops[troopId]) {
                this._branch[this._indent] = 0;
                FoglandsMapBattle.start(troopId, this._params[2], this._params[3], 'event');
            }
        }
        return true;
    };

    Scene_Map.prototype.updateEncounter = function() {
        if (!$gameMap.isEventRunning() && $gamePlayer._encounterCount <= 0) {
            $gamePlayer.makeEncounterCount();
            var troopId = $gamePlayer.makeEncounterTroopId();
            if ($dataTroops[troopId]) {
                BattleManager.onEncounter();
                FoglandsMapBattle.start(troopId, true, false, 'encounter');
            }
        }
    };

    var _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);
        FoglandsMapBattle.setupEnemySlots();
    };
})();
