'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;

global.Game_System = function Game_System() {
    this.initialize();
};
Game_System.prototype.initialize = function() {};

global.Window_ChoiceList = function Window_ChoiceList() {
    this._list = [];
    this._index = 0;
};
Window_ChoiceList.prototype.addCommand = function(name, symbol, enabled) {
    this._list.push({
        name: name,
        symbol: symbol,
        enabled: enabled === undefined ? true : enabled
    });
};
Window_ChoiceList.prototype.makeCommandList = function() {
    const choices = $gameMessage.choices();
    for (let i = 0; i < choices.length; i++) {
        this.addCommand(choices[i], 'choice');
    }
};
Window_ChoiceList.prototype.selectDefault = function() {
    this.select(0);
};
Window_ChoiceList.prototype.select = function(index) {
    this._index = index;
};
Window_ChoiceList.prototype.isCurrentItemEnabled = function() {
    return this._list[this._index] ? this._list[this._index].enabled : false;
};
Window_ChoiceList.prototype.isCommandEnabled = function(index) {
    return this._list[index].enabled;
};
Window_ChoiceList.prototype.changePaintOpacity = function() {};
Window_ChoiceList.prototype.drawItem = function() {};

require('../js/plugins/Foglands_Companions.js');

function newSystem() {
    global.$gameSystem = new Game_System();
    return global.$gameSystem;
}

test('new games start with an empty save-backed deployment', function() {
    const system = newSystem();

    assert.deepEqual(system._foglandsCompanionDeployment, {
        version: 1,
        deployedIds: []
    });
    assert.deepEqual(FoglandsCompanions.deployedIds(), []);
});

test('deployment changes are idempotent and separate from MV party state', function() {
    const system = newSystem();

    assert.equal(FoglandsCompanions.setDeployed('seer', true), true);
    assert.equal(FoglandsCompanions.setDeployed('seer', true), true);
    assert.deepEqual(FoglandsCompanions.deployedIds(), ['seer']);
    assert.equal(FoglandsCompanions.isDeployed('seer'), true);
    assert.equal(FoglandsCompanions.balloonId('seer'), 4);
    assert.equal(FoglandsCompanions.balloonId('shield'), 9);
    assert.equal(system._foglandsCompanionDeployment.deployedIds.length, 1);

    assert.equal(FoglandsCompanions.setDeployed('seer', false), true);
    assert.equal(FoglandsCompanions.isDeployed('seer'), false);
});

test('unknown companions are rejected', function() {
    newSystem();

    assert.equal(FoglandsCompanions.setDeployed('unknown', true), false);
    assert.deepEqual(FoglandsCompanions.deployedIds(), []);
    assert.equal(FoglandsCompanions.actorId('unknown'), 0);
});

test('older saves are normalized lazily without losing valid deployment', function() {
    newSystem();
    $gameSystem._foglandsCompanionDeployment = {
        deployedIds: ['merc', 'merc', 'unknown', 'hunter']
    };

    assert.deepEqual(FoglandsCompanions.deployedIds(), ['merc', 'hunter']);
    assert.deepEqual($gameSystem._foglandsCompanionDeployment, {
        version: 1,
        deployedIds: ['merc', 'hunter']
    });
});

test('deployment is capped at four while selected companions remain removable', function() {
    newSystem();

    ['seer', 'shield', 'bard', 'alch'].forEach(function(companionId) {
        assert.equal(FoglandsCompanions.setDeployed(companionId, true), true);
    });

    assert.equal(FoglandsCompanions.maxDeployed(), 4);
    assert.equal(FoglandsCompanions.isFull(), true);
    assert.equal(FoglandsCompanions.canDeploy('merc'), false);
    assert.equal(FoglandsCompanions.setDeployed('merc', true), false);
    assert.deepEqual(FoglandsCompanions.deployedIds(), [
        'seer', 'shield', 'bard', 'alch'
    ]);

    assert.equal(FoglandsCompanions.canDeploy('seer'), true);
    assert.equal(FoglandsCompanions.setDeployed('seer', false), true);
    assert.equal(FoglandsCompanions.isFull(), false);
    assert.equal(FoglandsCompanions.setDeployed('merc', true), true);
});

test('full deployment disables only the add choice and selects quit by default', function() {
    newSystem();
    ['seer', 'shield', 'bard', 'alch'].forEach(function(companionId) {
        FoglandsCompanions.setDeployed(companionId, true);
    });

    global.$gameMessage = {
        choices: function() {
            return ['오늘 밤 데려간다', '그만둔다'];
        }
    };
    const addWindow = new Window_ChoiceList();
    addWindow.makeCommandList();
    addWindow.selectDefault();

    assert.deepEqual(addWindow._list.map(function(command) {
        return command.enabled;
    }), [false, true]);
    assert.equal(addWindow._index, 1);

    $gameMessage = {
        choices: function() {
            return ['오늘 밤 출전에서 뺀다', '그만둔다'];
        }
    };
    const removeWindow = new Window_ChoiceList();
    removeWindow.makeCommandList();

    assert.deepEqual(removeWindow._list.map(function(command) {
        return command.enabled;
    }), [true, true]);
});

test('oversized legacy deployment keeps the first four valid unique ids', function() {
    newSystem();
    $gameSystem._foglandsCompanionDeployment = {
        deployedIds: ['seer', 'shield', 'bard', 'alch', 'merc', 'seer']
    };

    assert.deepEqual(FoglandsCompanions.deployedIds(), [
        'seer', 'shield', 'bard', 'alch'
    ]);
});
