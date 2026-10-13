import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPerson, shopKey, shopName, shopOf } from '../src/payees.ts';

describe('payees', () => {
  it('takes every shop of a chain for one, whichever alphabet and shop number the bank writes', () => {
    assert.equal(shopKey('Lenta-0089'), 'lenta');
    assert.equal(shopKey('Лента-0089'), 'lenta');
    assert.equal(shopKey('Lenta 178'), 'lenta');
    assert.equal(shopKey('ЛУКОЙЛ'), 'lukoil');
    assert.equal(shopKey('YM*Avito'), shopKey('YMAvito'));
    assert.equal(shopKey('Московский'), 'moskovski');
    assert.equal(shopKey('MOSKOVSKIJ'), 'moskovski');
    assert.equal(shopKey('Moskovskiy'), 'moskovski');
    assert.equal(shopKey('Яндекс Еда'), shopKey('YANDEX EDA'));
    assert.equal(shopKey('Пятёрочка'), shopKey('PYATEROCHKA'));
    assert.notEqual(shopKey('220024******4099'), shopKey('220024******6141'), 'cards by number stay apart');
    assert.notEqual(shopKey('GAZPROMNEFT AZS 089'), shopKey('GAZPROM*5541*GPN'));
  });

  it('takes a payment by QR code or SBP for the shop it paid', () => {
    assert.equal(shopOf('KhlebIzTandyraSBP'), shopOf('KHLEB IZ TANDYRA_'));
    assert.equal(shopOf('BRISTOL 4226PQR'), shopOf('BRISTOL 4226'));
    assert.equal(shopOf('GORY NOCH PANASIAN QR'), shopOf('Gory Noch Panasian'));
    assert.equal(shopOf('Lenta-0089'), 'lenta');
    assert.equal(shopOf('SBP'), 'sbp', 'a name of the mark alone stays');
    assert.equal(shopOf('KhofenbergPSBP'), shopOf('Хофенберг'), 'a mark cut short goes too');
    assert.equal(shopOf('Vostochnaya Kukhnya PQ'), shopOf('Vostochnaya Kukhnya'));
    assert.equal(shopOf('Abdurakhmonov B. M.SQR'), shopOf('ABDURAKHMONOV B. M. -'));
  });

  it('calls a shop by its name without the shop number', () => {
    assert.equal(shopName('Lenta-0089'), 'Lenta');
    assert.equal(shopName('DNS 7 385'), 'DNS');
    assert.equal(shopName('APTECHNYY PUNKT N52'), 'APTECHNYY PUNKT');
    assert.equal(shopName('GAZPROM*5541*GPN'), 'GAZPROM GPN');
    assert.equal(shopName('Т-Мобайл'), 'Т-Мобайл');
    assert.equal(shopName('7777'), '7777', 'a name of numbers only stays');
  });

  it('tells a person by how banks name the other side of a transfer', () => {
    assert.equal(isPerson('Татьяна А.'), true);
    assert.equal(isPerson('Т-Мобайл'), false);
    assert.equal(isPerson('Lenta 178'), false);
  });
});
