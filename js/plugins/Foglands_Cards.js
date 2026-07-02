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
 *
 * Current scope:
 * - Loads data/FogCards.json as $dataFogCards.
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

    FoglandsCards.selection = function() {
        if (!$gameSystem._fogSelectedCardIds) {
            $gameSystem._fogSelectedCardIds = [];
        }
        return $gameSystem._fogSelectedCardIds;
    };

    FoglandsCards.selectedCardIds = function() {
        return FoglandsCards.selection().slice();
    };

    FoglandsCards.selectedCards = function() {
        return FoglandsCards.selectedCardIds().map(function(cardId) {
            return $dataFogCards[cardId];
        }).filter(function(card) {
            return !!card;
        });
    };

    FoglandsCards.isSelected = function(cardId) {
        return FoglandsCards.selection().indexOf(cardId) >= 0;
    };

    FoglandsCards.toggleSelection = function(cardId) {
        var selected = FoglandsCards.selection();
        var index = selected.indexOf(cardId);

        if (index >= 0) {
            selected.splice(index, 1);
            return false;
        }

        selected.push(cardId);
        while (selected.length > maxSelection) {
            selected.shift();
        }
        return true;
    };

    FoglandsCards.clearSelection = function() {
        $gameSystem._fogSelectedCardIds = [];
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
        this._data = FoglandsCards.allCards();
    };

    Window_FogCardList.prototype.refresh = function() {
        this.makeItemList();
        this.createContents();
        this.drawAllItems();
    };

    Window_FogCardList.prototype.drawItem = function(index) {
        var card = this._data[index];
        if (!card) return;

        var rect = this.itemRectForText(index);
        var iconWidth = Window_Base._iconWidth + 4;
        var selectedWidth = 62;
        var rateWidth = 58;
        var tierWidth = 64;
        var categoryWidth = 54;
        var nameWidth = Math.max(120, rect.width - iconWidth - selectedWidth -
            rateWidth - tierWidth - categoryWidth - 16);
        var x = rect.x;

        this.resetTextColor();
        this.drawIcon(card.iconIndex || 0, x, rect.y + 2);
        x += iconWidth;

        this.changeTextColor(this.powerUpColor());
        this.drawText(FoglandsCards.isSelected(card.id) ? '(선택)' : '', x, rect.y, selectedWidth);
        x += selectedWidth;

        this.changeTextColor(this.normalColor());
        this.drawText(card.name, x, rect.y, nameWidth);
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
        var card = this.item();
        if (!this._helpWindow) return;
        if (card) {
            var text = [
                card.name + ' [' + FoglandsCards.tierLabel(card.tier) + ' / ' + FoglandsCards.categoryLabel(card.category) + ']',
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
        var card = this._cardWindow.item();
        if (card) {
            FoglandsCards.toggleSelection(card.id);
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
        }
    };
})();
