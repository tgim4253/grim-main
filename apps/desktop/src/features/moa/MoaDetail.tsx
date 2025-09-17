import ManageMoaTitleBar from './layout/ManageMoaTitleBar';
import ManageMoaSidebar from './layout/ManageMoaSidebar';
import { Routes, Route, useNavigate } from 'react-router-dom';
import TypeSelect from './TypeSelect';
import NewMoa from './NewMoa';
import { Button } from '@tgim/ui';
import { useTranslation } from 'react-i18next';

interface Props {
  type: 'import' | 'new';
}
const BackIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="lucide lucide-arrow-left"
  >
    <path d="M19 12H5" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);
const MoaDetail: React.FC<Props> = ({ type }) => {
  const { t } = useTranslation(['common']);
  const navigate = useNavigate();
  return (
    <div className="relative flex flex-col items-center justify-center h-full bg-surface text-text ">
      <Button
        variant="icon"
        className="absolute top-1 left-4 text-icon-main hover:text-icon-hover-main"
        onClick={() => navigate(-1)}
      >
        <div className="flex items-center space-x-2">
          <BackIcon />
          <span>{t('common:back')}</span>
        </div>
      </Button>
      <div className="mt-10">{type === 'new' ? <NewMoa /> : <NewMoa />}</div>
    </div>
  );
};

export default MoaDetail;
