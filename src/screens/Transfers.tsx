import { useState } from 'react';
import type { Db } from '../data/store';
import { setReceived } from '../domain/actions';
import { forecastView, type ShareView } from '../domain/calc';
import { received } from '../domain/select';
import { monthShort, type MonthKey } from '../lib/dates';
import { money, parseAmount, plainAmount } from '../lib/money';
import { Icon } from '../ui/icons';
import { Alert, Avatar } from '../ui/kit';

/**
 * Transfers to the joint account, made at the start of the month from the confirmed
 * forecast. Each one is ticked when done, or corrected if a different amount was sent.
 */
export function TransfersCard({ db, month, title }: { db: Db; month: MonthKey; title?: string }) {
  const [editing, setEditing] = useState<ShareView | null>(null);
  const view = forecastView(db, month);
  if (!view.confirmedAt || !view.shares.length) return null;
  return (
    <section aria-labelledby={'tr-' + month}>
      <h2 className="sh" id={'tr-' + month}>
        <span>{title ?? 'Transfers for ' + monthShort(month)}</span>
      </h2>
      <div className="card lst">
        {view.shares.map((s) => {
          const got = received(db, month, s.member.id);
          let line = 'To transfer · not done yet';
          let tone = 'var(--warn)';
          if (got != null) {
            const diff = got - s.transfer;
            line = diff === 0 ? 'Done' : diff > 0 ? money(got) + ' sent · ' + money(diff) + ' more, credited next month' : money(got) + ' sent · ' + money(-diff) + ' less, added next month';
            tone = diff === 0 ? 'var(--good)' : 'var(--sec)';
          }
          return (
            <div key={s.member.id} className="prow">
              <Avatar name={s.member.name} color={s.member.color} size={34} />
              <button
                type="button"
                className="grow"
                onClick={() => setEditing(s)}
                aria-label={'Change the amount ' + s.member.name + ' transferred'}
                style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left', color: 'var(--label)', cursor: 'pointer', fontSize: 17, minHeight: 44 }}
              >
                <span style={{ display: 'block', fontWeight: 500 }}>
                  {s.member.name} · <span className="num">{money(s.transfer)}</span>
                </span>
                <span className="cap" style={{ display: 'block', color: tone }}>
                  {line}
                </span>
              </button>
              {got == null ? (
                <button className="chip tint" type="button" style={{ minHeight: 40 }} onClick={() => setReceived(month, s.member.id, s.transfer)}>
                  <Icon name="check" size={16} stroke={2.6} />
                  Done
                </button>
              ) : (
                <Icon name="checkCircle" size={22} style={{ color: 'var(--good)', marginRight: 6 }} />
              )}
            </div>
          );
        })}
      </div>
      <p className="cap foot">Tap a name if a different amount was sent: the difference is carried into next month.</p>
      {editing && <AmountDialog month={month} share={editing} current={received(db, month, editing.member.id)} onClose={() => setEditing(null)} />}
    </section>
  );
}

function AmountDialog({ month, share, current, onClose }: { month: MonthKey; share: ShareView; current: number | null; onClose: () => void }) {
  const [text, setText] = useState(plainAmount(current ?? share.transfer));
  return (
    <Alert
      title={share.member.name + "'s transfer"}
      message={'Asked from the ' + monthShort(month) + ' forecast: ' + money(share.transfer) + '.'}
      buttons={[
        { label: 'Cancel', style: 'cancel', onClick: onClose },
        ...(current != null
          ? [
              {
                label: 'Not done yet',
                onClick: () => {
                  setReceived(month, share.member.id, null);
                  onClose();
                }
              }
            ]
          : []),
        {
          label: 'Save',
          onClick: () => {
            setReceived(month, share.member.id, parseAmount(text) ?? 0);
            onClose();
          }
        }
      ]}
    >
      <input
        className="field num"
        style={{ marginTop: 12, height: 44, background: 'var(--card)', textAlign: 'center' }}
        type="text"
        inputMode="decimal"
        aria-label="Amount transferred"
        value={text}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setText(e.target.value)}
      />
    </Alert>
  );
}
