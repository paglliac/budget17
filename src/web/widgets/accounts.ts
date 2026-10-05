import { money, moneyParts } from '../format.ts';
import { html, type Content, type Html } from '../html.ts';

/** The big total with quieter kopecks, a note on what it covers, and anything to show under it. */
export function balanceTotal(options: { amount: number; symbol: string; note: string; footer?: Content }): Html {
  const { whole, rest } = moneyParts(options.amount, options.symbol);
  return html`
    <div class="total">
      <p class="total-amount">${whole}<span>${rest}</span></p>
      <p class="total-note">${options.note}</p>
      ${options.footer ? html`<div class="total-footer">${options.footer}</div>` : null}
    </div>`;
}

export interface AccountItem {
  title: string;
  /** Account type, such as Карта. */
  subtitle: string;
  balance: number;
  symbol: string;
  /** The balance in the main currency, for accounts in other currencies. */
  converted?: { amount: number; symbol: string };
  color: string;
}

/** Accounts with their balances. With a title the list is boxed, for a separate group. */
export function accountList(options: { accounts: AccountItem[]; title?: string }): Html {
  const list = html`<ul class="accounts">${options.accounts.map(
    (a) => html`
      <li class="account">
        <span class="account-dot" style="background:${a.color}"></span>
        <span class="account-name"><b>${a.title}</b><small>${a.subtitle}</small></span>
        <span class="account-amount">
          <b${a.balance < 0 ? html` class="negative"` : null}>${money(a.balance, a.symbol)}</b>
          ${a.converted ? html`<small>≈ ${money(a.converted.amount, a.converted.symbol)}</small>` : null}
        </span>
      </li>`,
  )}</ul>`;
  return options.title ? html`<div class="accounts-box"><h3>${options.title}</h3>${list}</div>` : list;
}
