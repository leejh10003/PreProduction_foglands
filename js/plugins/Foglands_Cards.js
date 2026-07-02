/*:
 * @plugindesc Loads Foglands cards and shows them in an RPG Maker MV style list window.
 * @author Codex
 *
 * @help
 * Foglands_Cards
 *
 * Plugin Commands:
 *   FogCards open
 *   FogCards list
 *   FogCards clear
 *   FogCards reset
 *
 * Current scope:
 * - Loads data/FogCards.json as $dataFogCards.
 * - Creates a starter runtime card collection from the prototype.
 * - Provides a card list interface using MV windows.
 * - Supports simple global multi-selection.
 *
 * @param Max Selection
 * @type number
 * @min 1
 * @default 7
 * @desc Maximum number of selected cards. When exceeded, the oldest selected card is removed.
 */

(function() {
    'use strict';

    var pluginName = 'Foglands_Cards';
    var params = PluginManager.parameters(pluginName);
    var maxSelection = Number(params['Max Selection'] || 7);
    var STARTER_RECIPE = [
        ['old_sword', 3],
        ['dull_slash', 2],
        ['worn_shield', 3],
        ['emergency_cloth', 2]
    ];

    window.$dataFogCards = null;
    DataManager._databaseFiles.push({ name: '$dataFogCards', src: 'FogCards.json' });

    window.FoglandsCards = window.FoglandsCards || {};

    var CATEGORY_LABELS = {
        attack: '공격',
        defense: '방어',
        skill: '스킬',
        curse: '저주'
    };

    var TIER_LABELS = {
        common: '일반',
        uncommon: '비범',
        mythic: '신화',
        curse: '저주'
    };

    var TIER_COLORS = {
        common: 0,
        uncommon: 14,
        mythic: 17,
        curse: 8
    };

    FoglandsCards.allCards = function() {
        return ($dataFogCards || []).filter(function(card) {
            return !!card;
        });
    };

    FoglandsCards.cardByKey = function(key) {
        return FoglandsCards.allCards().filter(function(card) {
            return card.key === key;
        })[0] || null;
    };

    FoglandsCards.cardData = function(instanceOrCardId) {
        if (!instanceOrCardId) return null;
        if (typeof instanceOrCardId === 'number') return $dataFogCards[instanceOrCardId] || null;
        return $dataFogCards[instanceOrCardId.cardId] || null;
    };

    FoglandsCards.nextUid = function() {
        if (!$gameSystem._fogNextCardUid) {
            $gameSystem._fogNextCardUid = 1;
        }
        return $gameSystem._fogNextCardUid++;
    };

    FoglandsCards.makeInstance = function(cardId) {
        return {
            uid: FoglandsCards.nextUid(),
            cardId: cardId,
            upgraded: false
        };
    };

    FoglandsCards.createStarterCollection = function() {
        var instances = [];
        STARTER_RECIPE.forEach(function(entry) {
            var card = FoglandsCards.cardByKey(entry[0]);
            var count = entry[1];
            if (!card) return;
            for (var i = 0; i < count; i++) {
                instances.push(FoglandsCards.makeInstance(card.id));
            }
        });
        return instances;
    };

    FoglandsCards.collection = function() {
        if (!$gameSystem._fogCardInstances) {
            $gameSystem._fogNextCardUid = 1;
            $gameSystem._fogCardInstances = FoglandsCards.createStarterCollection();
            FoglandsCards.clearSelection();
        }
        return $gameSystem._fogCardInstances;
    };

    FoglandsCards.resetCollection = function() {
        $gameSystem._fogNextCardUid = 1;
        $gameSystem._fogCardInstances = FoglandsCards.createStarterCollection();
        FoglandsCards.clearSelection();
    };

    FoglandsCards.selection = function() {
        if (!$gameSystem._fogSelectedCardUids) {
            $gameSystem._fogSelectedCardUids = [];
        }
        return $gameSystem._fogSelectedCardUids;
    };

    FoglandsCards.selectedCardUids = function() {
        return FoglandsCards.selection().slice();
    };

    FoglandsCards.selectedCardIds = function() {
        return FoglandsCards.selectedInstances().map(function(instance) {
            return instance.cardId;
        });
    };

    FoglandsCards.selectedInstances = function() {
        var byUid = {};
        FoglandsCards.collection().forEach(function(instance) {
            byUid[instance.uid] = instance;
        });
        return FoglandsCards.selectedCardUids().map(function(uid) {
            return byUid[uid];
        }).filter(function(instance) {
            return !!instance;
        });
    };

    FoglandsCards.selectedCards = function() {
        return FoglandsCards.selectedInstances().map(function(instance) {
            return FoglandsCards.cardData(instance);
        }).filter(function(card) {
            return !!card;
        });
    };

    FoglandsCards.isSelected = function(uid) {
        return FoglandsCards.selection().indexOf(uid) >= 0;
    };

    FoglandsCards.toggleSelection = function(uid) {
        var selected = FoglandsCards.selection();
        var index = selected.indexOf(uid);

        if (index >= 0) {
            selected.splice(index, 1);
            return false;
        }

        selected.push(uid);
        while (selected.length > maxSelection) {
            selected.shift();
        }
        return true;
    };

    FoglandsCards.clearSelection = function() {
        $gameSystem._fogSelectedCardUids = [];
    };

    FoglandsCards.maxSelection = function() {
        return maxSelection;
    };

    FoglandsCards.categoryLabel = function(category) {
        return CATEGORY_LABELS[category] || category || '';
    };

    FoglandsCards.tierLabel = function(tier) {
        return TIER_LABELS[tier] || tier || '';
    };

    FoglandsCards.effectText = function(card) {
        if (!card) return '';
        if (card.description) return card.description;
        return (card.effects || []).map(function(effect) {
            var value = effect.value != null ? ' ' + effect.value : '';
            if (effect.repeats) value += ' x ' + effect.repeats;
            if (effect.code === 'damage') return '피해' + value;
            if (effect.code === 'block') return '방어막' + value;
            if (effect.code === 'heal') return '회복' + value;
            if (effect.code === 'poison') return '중독' + value;
            if (effect.code === 'fizzle') return '불발';
            return effect.code + value;
        }).join(' / ');
    };

    function Window_FogCardList() {
        this.initialize.apply(this, arguments);
    }

    Window_FogCardList.prototype = Object.create(Window_Selectable.prototype);
    Window_FogCardList.prototype.constructor = Window_FogCardList;

    Window_FogCardList.prototype.initialize = function(x, y, width, height) {
        Window_Selectable.prototype.initialize.call(this, x, y, width, height);
        this._data = [];
        this.refresh();
        this.select(0);
        this.activate();
    };

    Window_FogCardList.prototype.maxItems = function() {
        return this._data ? this._data.length : 0;
    };

    Window_FogCardList.prototype.item = function() {
        return this._data && this.index() >= 0 ? this._data[this.index()] : null;
    };

    Window_FogCardList.prototype.makeItemList = function() {
        this._data = FoglandsCards.collection();
    };

    Window_FogCardList.prototype.refresh = function() {
        this.makeItemList();
        this.createContents();
        this.drawAllItems();
    };

    Window_FogCardList.prototype.drawItem = function(index) {
        var instance = this._data[index];
        var card = FoglandsCards.cardData(instance);
        if (!instance || !card) return;

        var rect = this.itemRectForText(index);
        var iconWidth = Window_Base._iconWidth + 4;
        var selectedWidth = 62;
        var uidWidth = 46;
        var rateWidth = 58;
        var tierWidth = 64;
        var categoryWidth = 54;
        var nameWidth = Math.max(120, rect.width - iconWidth - selectedWidth - uidWidth -
            rateWidth - tierWidth - categoryWidth - 20);
        var x = rect.x;

        this.resetTextColor();
        this.drawIcon(card.iconIndex || 0, x, rect.y + 2);
        x += iconWidth;

        this.changeTextColor(this.powerUpColor());
        this.drawText(FoglandsCards.isSelected(instance.uid) ? '(선택)' : '', x, rect.y, selectedWidth);
        x += selectedWidth;

        this.changeTextColor(this.textColor(7));
        this.drawText('#' + instance.uid, x, rect.y, uidWidth);
        x += uidWidth;

        this.changeTextColor(this.normalColor());
        this.drawText(card.name + (instance.upgraded ? '+' : ''), x, rect.y, nameWidth);
        x += nameWidth;

        this.changeTextColor(this.systemColor());
        this.drawText(FoglandsCards.categoryLabel(card.category), x, rect.y, categoryWidth, 'right');
        x += categoryWidth + 4;

        this.changeTextColor(this.textColor(TIER_COLORS[card.tier] || 0));
        this.drawText(FoglandsCards.tierLabel(card.tier), x, rect.y, tierWidth, 'right');
        x += tierWidth + 4;

        this.changeTextColor(card.category === 'curse' ? this.deathColor() : this.normalColor());
        this.drawText((card.successRate || 0) + '%', x, rect.y, rateWidth, 'right');
        this.resetTextColor();
    };

    Window_FogCardList.prototype.updateHelp = function() {
        var instance = this.item();
        var card = FoglandsCards.cardData(instance);
        if (!this._helpWindow) return;
        if (card) {
            var text = [
                '#' + instance.uid + ' ' + card.name + (instance.upgraded ? '+' : '') +
                    ' [' + FoglandsCards.tierLabel(card.tier) + ' / ' + FoglandsCards.categoryLabel(card.category) + ']',
                '확률 ' + (card.successRate || 0) + '% - ' + FoglandsCards.effectText(card)
            ].join('\n');
            this._helpWindow.setText(text);
        } else {
            this._helpWindow.clear();
        }
    };

    function Scene_FogCardList() {
        this.initialize.apply(this, arguments);
    }

    Scene_FogCardList.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_FogCardList.prototype.constructor = Scene_FogCardList;

    Scene_FogCardList.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
    };

    Scene_FogCardList.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createHelpWindow();
        this.createCardWindow();
    };

    Scene_FogCardList.prototype.createCardWindow = function() {
        var y = this._helpWindow.height;
        var height = Graphics.boxHeight - y;
        this._cardWindow = new Window_FogCardList(0, y, Graphics.boxWidth, height);
        this._cardWindow.setHelpWindow(this._helpWindow);
        this._cardWindow.setHandler('ok', this.onCardOk.bind(this));
        this._cardWindow.setHandler('cancel', this.popScene.bind(this));
        this.addWindow(this._cardWindow);
    };

    Scene_FogCardList.prototype.onCardOk = function() {
        var instance = this._cardWindow.item();
        if (instance) {
            FoglandsCards.toggleSelection(instance.uid);
            this._cardWindow.refresh();
            this._cardWindow.select(this._cardWindow.index());
            this._cardWindow.callUpdateHelp();
        }
        this._cardWindow.activate();
    };

    window.Scene_FogCardList = Scene_FogCardList;
    window.Window_FogCardList = Window_FogCardList;

    var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);

        if (command !== 'FogCards') return;

        var subcommand = args[0] || 'open';
        if (subcommand === 'open' || subcommand === 'list') {
            SceneManager.push(Scene_FogCardList);
        } else if (subcommand === 'clear') {
            FoglandsCards.clearSelection();
        } else if (subcommand === 'reset') {
            FoglandsCards.resetCollection();
        }
    };
})();
