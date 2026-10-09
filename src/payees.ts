// Payees as people tell them apart: a shop is one whatever number of its shop the bank adds and whichever alphabet
// it writes it in, and a person is named by the bank in SBP transfers as Татьяна А.

/** A person as banks name the other side of an SBP transfer: Татьяна А. */
const PERSON = /^[А-ЯЁ][а-яё]+ [А-ЯЁ]\.$/;

export function isPerson(payee: string): boolean {
  return PERSON.test(payee);
}

const LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/**
 * A shop's name as one key whatever the bank wrote: in Latin letters, as banks write Russian names on card payments,
 * lower case, letters only. Lenta 089, Lenta-0089 and Лента-0089 are all lenta, YM*Avito and YMAvito ymavito. Banks
 * spell й, ы and я each their own way, so j and y count as i, x as ks, and a doubled letter as one: Московский,
 * MOSKOVSKIJ and Moskovskiy are all moskovski, Яндекс and YANDEX iandeks. A name without letters, such as a card
 * number, is its own key.
 */
export function shopKey(name: string): string {
  const key = name
    .toLocaleLowerCase('ru')
    .replace(/[а-яё]/g, (letter) => LATIN[letter]!)
    .replace(/[^\p{L}]+/gu, '')
    .replace(/[jy]/g, 'i')
    .replace(/x/g, 'ks')
    .replace(/(\p{L})\1+/gu, '$1');
  return key || name.replace(/\s+/g, '');
}

/**
 * A shop's name without its shop number, to call all its shops by: Lenta-0089 is Lenta, APTECHNYY PUNKT N52 APTECHNYY
 * PUNKT, GAZPROM*5541*GPN GAZPROM GPN.
 */
export function shopName(name: string): string {
  return name.replace(/(?:[\s\-_*#№.]|\bN(?=\d))*\d[\d\s\-_*.]*/g, ' ').replace(/\s+/g, ' ').trim() || name;
}
