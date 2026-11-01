import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useDb } from '../../data/store';
import { reorderCategories } from '../../domain/actions';
import { categories, expenses } from '../../domain/select';
import { plural } from '../../lib/dates';
import { Icon } from '../../ui/icons';
import { BackLink, NavBar, Tile } from '../../ui/kit';
import { openOverlay } from '../../ui/overlays';

export function ManageCategories() {
  const db = useDb();
  const cats = categories(db);
  const [edit, setEdit] = useState(false);
  const [order, setOrder] = useState<string[]>(cats.map((c) => c.id));
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null);
  const ref = useRef<{ startY: number; rowH: number } | null>(null);

  // Follow additions and deletions made in the sheets.
  const key = cats.map((c) => c.id).join(',');
  useEffect(() => {
    if (!drag) setOrder(cats.map((c) => c.id));
  }, [key]);

  const counts = new Map<string, number>();
  for (const e of expenses(db)) counts.set(e.categoryId, (counts.get(e.categoryId) ?? 0) + 1);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const list = order.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c);

  const onMove = (e: ReactPointerEvent) => {
    const r = ref.current;
    if (!drag || !r) return;
    let dy = e.clientY - r.startY;
    const idx = order.indexOf(drag.id);
    if (dy > r.rowH / 2 && idx < order.length - 1) {
      const next = [...order];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      setOrder(next);
      r.startY += r.rowH;
      dy -= r.rowH;
    } else if (dy < -r.rowH / 2 && idx > 0) {
      const next = [...order];
      [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
      setOrder(next);
      r.startY -= r.rowH;
      dy += r.rowH;
    }
    setDrag({ id: drag.id, dy });
  };

  const endDrag = () => {
    if (!drag) return;
    setDrag(null);
    ref.current = null;
    reorderCategories(order);
  };

  const move = (id: string, delta: number) => {
    const idx = order.indexOf(id);
    const to = idx + delta;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[idx], next[to]] = [next[to], next[idx]];
    setOrder(next);
    reorderCategories(next);
  };

  return (
    <div className="sub">
      <NavBar
        left={<BackLink to="/settings" label="Settings" />}
        title="Categories"
        right={
          <button className="navbtn strong" type="button" onClick={() => setEdit(!edit)}>
            {edit ? 'Done' : 'Edit'}
          </button>
        }
      />
      <div className="sub-body" style={{ gap: 14, paddingTop: 16 }}>
        <div className="card visible lst in56" onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
          {list.map((c) => {
            const n = counts.get(c.id) ?? 0;
            const sub = (n ? plural(n, 'expense') : 'No expenses') + (c.recurringDay ? ' · recurring' : c.custom ? ' · custom' : '');
            const lifted = drag?.id === c.id;
            return (
              <div key={c.id} className={'catrow' + (lifted ? ' lifted' : '')} style={lifted ? { transform: 'translateY(' + drag!.dy + 'px) scale(1.02)' } : undefined}>
                {edit && (
                  <button className="minus" type="button" aria-label={'Delete ' + c.name} onClick={() => openOverlay({ deleteCategory: c.id })}>
                    <span>−</span>
                  </button>
                )}
                <button className="cname" type="button" onClick={() => openOverlay({ category: { id: c.id } })}>
                  <Tile icon={c.icon} color={c.color} iconSize={19} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block' }}>{c.name}</span>
                    <span className="cap">{sub}</span>
                  </span>
                </button>
                {edit ? (
                  <button
                    className="handle"
                    type="button"
                    aria-label={'Move ' + c.name + '. Use the arrow keys to move it up or down.'}
                    style={lifted ? { color: 'var(--tintText)' } : undefined}
                    onPointerDown={(e) => {
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      const row = (e.currentTarget as HTMLElement).parentElement!;
                      ref.current = { startY: e.clientY, rowH: row.offsetHeight };
                      setDrag({ id: c.id, dy: 0 });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        move(c.id, -1);
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        move(c.id, 1);
                      }
                    }}
                  >
                    <Icon name="handle" size={22} />
                  </button>
                ) : (
                  <span className="chev" style={{ width: 32, display: 'flex', justifyContent: 'center' }}>
                    <Icon name="chevron" size={18} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <p className="cap" style={{ margin: '-4px 16px 0' }}>
          {edit ? 'Drag the handles to reorder. The order is used in the add-expense grid.' : 'Tap a category to rename it, change its icon and color, or set a fixed monthly amount.'}
        </p>
        <div className="card">
          <button className="row link" type="button" onClick={() => openOverlay({ category: {} })}>
            <span className="addico">
              <Icon name="plus" size={19} />
            </span>
            <span className="grow">New category</span>
          </button>
        </div>
      </div>
    </div>
  );
}
