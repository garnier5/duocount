import type { Overlays } from '../../ui/overlays';
import { CategorySheet } from './CategorySheet';
import { DeleteCategorySheet } from './DeleteCategorySheet';
import { ExpenseSheet } from './ExpenseSheet';
import { MonthPicker } from './MonthPicker';

/** Renders whichever sheet is open above the current page. */
export function SheetHost({ overlays, ready }: { overlays: Overlays; ready: boolean }) {
  return (
    <>
      {ready && overlays.expense && <ExpenseSheet key={overlays.expense.id ?? 'new'} state={overlays.expense} />}
      {ready && overlays.monthPicker && <MonthPicker />}
      {overlays.category && <CategorySheet key={overlays.category.id ?? 'new'} id={overlays.category.id} onDraft={overlays.category.onDraft} />}
      {ready && overlays.deleteCategory && <DeleteCategorySheet id={overlays.deleteCategory} />}
    </>
  );
}
