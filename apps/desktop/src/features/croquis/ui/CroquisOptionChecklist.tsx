import { CheckboxRow } from '../../../shared/ui';

type ChecklistItem = {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
};

type CroquisOptionChecklistProps = {
  items: ChecklistItem[];
};

export function CroquisOptionChecklist({ items }: CroquisOptionChecklistProps) {
  return (
    <div className="croquis-check-grid">
      {items.map(item => (
        <CheckboxRow
          key={item.label}
          className="croquis-check"
          label={item.label}
          width="full"
          checked={item.checked}
          onCheckedChange={item.onChange}
        />
      ))}
    </div>
  );
}
