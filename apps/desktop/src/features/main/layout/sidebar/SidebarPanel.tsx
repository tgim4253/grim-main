import useSidebarStore from '@tgim/stores/sidebarStore';
import FileTreeDemo from '../../panel/FileTreePanel';

const SidebarPanel: React.FC<SidebarProps> = ({ sidebarPosition }) => {
  const activeTab = useSidebarStore(state => state.sidebars[sidebarPosition].activeTab);
  return (
    <div className="w-full border-border-sidebar border-t border-r rounded-tr-sm rounded-tl-md bg-sidebar-bg text-text overflow-y-auto h-full overflow-x-hidden">
      {activeTab === 'explorer' && <FileTreeDemo />}
    </div>
  );
};
export default SidebarPanel;
