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
            console.log(troopId, $dataTroops);
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
})();
