import type { GameState, Review, ReviewReason } from '../../sim/types';
import { h, setChildren, Watcher } from '../core/dom';
import { formatRating } from '../core/format';
import { registerPanel, type PanelContext, type PanelHandle } from '../hud/panels';

/** Chip text for the main reason behind a review; `good` picks the green or red chip. */
export const REASON_INFO: Readonly<Record<ReviewReason, { label: string; good: boolean }>> = {
  fast_service: { label: 'Phục vụ nhanh', good: true },
  tasty: { label: 'Đồ uống ngon', good: true },
  nice_decor: { label: 'Quán đẹp', good: true },
  long_wait: { label: 'Chờ lâu', good: false },
  out_of_stock: { label: 'Hết món', good: false },
  dirty_table: { label: 'Bàn bẩn', good: false },
};

const MAX_STARS = 5;

/** ★★★★☆ with the number, read as "4 trên 5 sao"; ratings show one decimal ("3,8"). */
export function starsEl(stars: number, small = true, prefix = ''): HTMLElement {
  const full = Math.max(0, Math.min(MAX_STARS, Math.round(stars)));
  const num = Number.isInteger(stars) ? String(stars) : formatRating(stars);
  return h(
    'span',
    { class: `rpt-stars${small ? ' is-sm' : ''}`, attrs: { role: 'img', 'aria-label': `${prefix}${num} trên 5 sao` } },
    h('span', { class: 'star', text: '★'.repeat(full) }),
    full < MAX_STARS ? h('span', { class: 'star-empty', text: '★'.repeat(MAX_STARS - full) }) : null,
    h('span', { class: 'rpt-stars-num', text: num }),
  );
}

function reasonChip(reason: ReviewReason): HTMLElement {
  const info = REASON_INFO[reason];
  return h('span', { class: `rpt-chip ${info.good ? 'is-good' : 'is-bad'}`, attrs: { 'data-reason': reason } }, `${info.good ? '👍' : '👎'} ${info.label}`);
}

/** One review card: author, stars, day, quote and the reason chip. */
export function reviewItem(review: Review): HTMLLIElement {
  return h(
    'li',
    { class: 'rpt-review', attrs: { 'data-stars': review.stars } },
    h('div', { class: 'rpt-review-head' }, h('span', { class: 'rpt-review-name', text: review.author }), starsEl(review.stars), h('span', { class: 'rpt-review-time', text: `Ngày ${review.day}` })),
    h('p', { text: `"${review.text}"` }),
    review.reason ? h('div', { class: 'rpt-chips' }, reasonChip(review.reason)) : null,
  );
}

/** Newest first. */
export function newestFirst(reviews: readonly Review[], limit = reviews.length): Review[] {
  return reviews.slice(-limit).reverse();
}

/** "👍 Đồ uống ngon · 7" chips for the reasons customers gave, most mentioned first. */
export function reasonSummary(reviews: readonly Review[]): { reason: ReviewReason; count: number }[] {
  const counts = new Map<ReviewReason, number>();
  for (const r of reviews) if (r.reason) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  return [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

/** Empty state that says how reviews appear, with an optional action button. */
export function reviewsEmpty(action?: HTMLElement): HTMLElement {
  return h(
    'div',
    { class: 'rpt-empty', attrs: { 'data-empty': 'reviews' } },
    h('span', { class: 'rpt-empty-icon', attrs: { 'aria-hidden': 'true' }, text: '💬' }),
    h('p', { class: 'rpt-strong', text: 'Chưa có đánh giá nào' }),
    h('p', { class: 'rpt-muted', text: 'Khách chỉ viết đánh giá sau khi được phục vụ xong hoặc khi bỏ đi. Phục vụ khách đầu tiên để thấy họ nói gì.' }),
    action ?? null,
  );
}

/** Fills `el` with the reason summary and the newest reviews, or the empty state. */
export function fillReviews(el: HTMLElement, reviews: readonly Review[], emptyAction?: HTMLElement): void {
  if (reviews.length === 0) {
    setChildren(el, reviewsEmpty(emptyAction));
    return;
  }
  const themes = reasonSummary(reviews);
  setChildren(
    el,
    themes.length > 0
      ? h(
          'div',
          {},
          h('p', { class: 'rpt-h4', text: 'Khách nhắc nhiều' }),
          h(
            'div',
            { class: 'rpt-chips' },
            ...themes.map(({ reason, count }) => {
              const chip = reasonChip(reason);
              chip.append(` · ${count}`);
              return chip;
            }),
          ),
        )
      : null,
    h('ul', { class: 'rpt-list', attrs: { 'aria-label': 'Đánh giá gần nhất' } }, ...newestFirst(reviews).map(reviewItem)),
  );
}

/** Dock panel "Đánh giá": every kept review, newest first. */
export function renderReviewsPanel(body: HTMLElement, ctx: PanelContext): PanelHandle {
  const list = h('div', { class: 'rpt-reviews' });
  const w = new Watcher<GameState>().watch(
    // Reviews are only appended (oldest dropped), so the newest one tells when the list changed.
    (s) => s.reviews[s.reviews.length - 1],
    (_, s) => fillReviews(list, s.reviews),
  );
  body.append(list);
  const state = ctx.getState();
  if (state) w.run(state);
  else setChildren(list, h('p', { class: 'rpt-muted', text: 'Chưa có ván chơi.' }));
  return { update: (s) => w.run(s) };
}

export const REVIEWS_PANEL_ID = 'reviews';

/** Adds the Reviews button to the dock. Returns a function that removes it. */
export function registerReviewsPanel(): () => void {
  return registerPanel(REVIEWS_PANEL_ID, 'Đánh giá', 'i-reviews', renderReviewsPanel);
}
