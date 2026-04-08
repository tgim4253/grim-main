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
        <label key={item.label} className="croquis-check">
          <input
            type="checkbox"
            checked={item.checked}
            onChange={event => {
              item.onChange(event.target.checked);
            }}
          />
          <span>{item.label}</span>
        </label>
      ))}
    </div>
  );
}
