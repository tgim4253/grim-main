import { AppTopBar } from '../../ui/Header/AppTopBar';
import { MiniSidebarRail } from '../../ui/Sidebar/MiniSidebarRail';
import { SidebarPanel } from '../../ui/Sidebar/SidebarPanel';
import './library-page.css';

export function LibraryPage() {
  return (
    <div className="app-shell library-page">
      <AppTopBar />

      <div className="app-horizontal library-page__layout">
        <div className="app-sidebar library-page__sidebar">
          <SidebarPanel rail={<MiniSidebarRail />} title="Explorer" />
        </div>

        <main className="app-workspace library-page__workspace" />
      </div>
    </div>
  );
}
