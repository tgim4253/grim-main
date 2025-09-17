import useSidebarStore from '@tgim/stores/sidebarStore';
import FileTreeDemo from '../../panel/FileTreePanel';

// Container that renders the currently active sidebar panel.
const SidebarPanel: React.FC<SidebarProps> = ({ sidebarPosition }) => {
  const activeTab = useSidebarStore(state => state.sidebars[sidebarPosition].activeTab);
  return (
    <div className="w-full h-full overflow-y-auto overflow-x-hidden border-t border-r border-border-sidebar bg-sidebar text-text rounded-tr-sm rounded-tl-md">
      {activeTab === 'explorer' && <FileTreeDemo />}
    </div>
  );
};
export default SidebarPanel;
