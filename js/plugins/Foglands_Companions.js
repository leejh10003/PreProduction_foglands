/*:
 * @plugindesc Stores Foglands companion deployment separately from the MV party.
 * @author Codex
 *
 * @help
 * Foglands_Companions
 *
 * This plugin owns the save-backed list of companions currently selected for
 * deployment. It does not add actors to $gameParty and does not alter MV
 * followers.
 *
 * Script API:
 *   FoglandsCompanions.maxDeployed()
 *   FoglandsCompanions.deployedIds()
 *   FoglandsCompanions.isFull()
 *   FoglandsCompanions.canDeploy(companionId)
 *   FoglandsCompanions.isDeployed(companionId)
 *   FoglandsCompanions.setDeployed(companionId, deployed)
 *   FoglandsCompanions.toggleDeployed(companionId)
 *   FoglandsCompanions.balloonId(companionId)
 */

(function(namespace) {
    'use strict';

    var STATE_VERSION = 1;
    var MAX_DEPLOYED = 4;
    var LIGHT_BULB_BALLOON_ID = 9;
    var HEART_BALLOON_ID = 4;
    var ADD_DEPLOYMENT_CHOICE = '오늘 밤 데려간다';
    var COMPANION_ACTOR_IDS = {
        seer: 2,
        shield: 3,
        bard: 4,
        alch: 5,
        merc: 6,
        hunter: 7,
        tinker: 8,
        gambler: 9,
        poisoner: 10
    };

    function isKnownCompanion(companionId) {
        return Object.prototype.hasOwnProperty.call(COMPANION_ACTOR_IDS, companionId);
    }

    function makeState() {
        return {
            version: STATE_VERSION,
            deployedIds: []
        };
    }

    function normalizeIds(ids) {
        var result = [];
        (Array.isArray(ids) ? ids : []).forEach(function(companionId) {
            if (result.length < MAX_DEPLOYED &&
                    isKnownCompanion(companionId) &&
                    result.indexOf(companionId) < 0) {
                result.push(companionId);
            }
        });
        return result;
    }

    function ensureState() {
        if (!window.$gameSystem) {
            return null;
        }
        var state = $gameSystem._foglandsCompanionDeployment;
        if (!state || typeof state !== 'object') {
            state = makeState();
            $gameSystem._foglandsCompanionDeployment = state;
        }
        state.version = STATE_VERSION;
        state.deployedIds = normalizeIds(state.deployedIds);
        return state;
    }

    var _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._foglandsCompanionDeployment = makeState();
    };

    namespace.actorId = function(companionId) {
        return COMPANION_ACTOR_IDS[companionId] || 0;
    };

    namespace.maxDeployed = function() {
        return MAX_DEPLOYED;
    };

    namespace.deployedIds = function() {
        var state = ensureState();
        return state ? state.deployedIds.slice() : [];
    };

    namespace.isDeployed = function(companionId) {
        return namespace.deployedIds().indexOf(companionId) >= 0;
    };

    namespace.isFull = function() {
        return namespace.deployedIds().length >= MAX_DEPLOYED;
    };

    namespace.canDeploy = function(companionId) {
        return isKnownCompanion(companionId) &&
            (namespace.isDeployed(companionId) || !namespace.isFull());
    };

    namespace.setDeployed = function(companionId, deployed) {
        if (!isKnownCompanion(companionId)) {
            return false;
        }
        var state = ensureState();
        if (!state) {
            return false;
        }
        var index = state.deployedIds.indexOf(companionId);
        if (deployed && index < 0) {
            if (state.deployedIds.length >= MAX_DEPLOYED) {
                return false;
            }
            state.deployedIds.push(companionId);
        } else if (!deployed && index >= 0) {
            state.deployedIds.splice(index, 1);
        }
        return namespace.isDeployed(companionId) === !!deployed;
    };

    namespace.toggleDeployed = function(companionId) {
        var deployed = !namespace.isDeployed(companionId);
        return namespace.setDeployed(companionId, deployed) ? deployed : false;
    };

    namespace.clearDeployment = function() {
        var state = ensureState();
        if (state) {
            state.deployedIds = [];
        }
    };

    namespace.balloonId = function(companionId) {
        return namespace.isDeployed(companionId) ? HEART_BALLOON_ID : LIGHT_BULB_BALLOON_ID;
    };

    namespace.stateVersion = function() {
        return STATE_VERSION;
    };

    if (typeof Window_ChoiceList !== 'undefined') {
        var _Window_ChoiceList_makeCommandList =
            Window_ChoiceList.prototype.makeCommandList;
        Window_ChoiceList.prototype.makeCommandList = function() {
            _Window_ChoiceList_makeCommandList.call(this);
            var choices = $gameMessage.choices();
            for (var i = 0; i < choices.length; i++) {
                if (choices[i] === ADD_DEPLOYMENT_CHOICE && namespace.isFull()) {
                    this._list[i].enabled = false;
                }
            }
        };

        var _Window_ChoiceList_selectDefault =
            Window_ChoiceList.prototype.selectDefault;
        Window_ChoiceList.prototype.selectDefault = function() {
            _Window_ChoiceList_selectDefault.call(this);
            if (!this.isCurrentItemEnabled()) {
                for (var i = 0; i < this._list.length; i++) {
                    if (this.isCommandEnabled(i)) {
                        this.select(i);
                        break;
                    }
                }
            }
        };

        var _Window_ChoiceList_drawItem = Window_ChoiceList.prototype.drawItem;
        Window_ChoiceList.prototype.drawItem = function(index) {
            this.changePaintOpacity(this.isCommandEnabled(index));
            _Window_ChoiceList_drawItem.call(this, index);
            this.changePaintOpacity(true);
        };
    }

})(window.FoglandsCompanions = window.FoglandsCompanions || {});
