import React from 'react';
import { cn } from '@tgim/utils/index';
import { Switch } from '@tgim/ui/index';

type Language = 'ko' | 'en' | 'jp';

type Props = {
  current: Language;
  onChanged?: (lng: Language) => void;
};

const LanguageSwitcher: React.FC<Props> = ({ current, onChanged }) => {
  return (
    <Switch<Language>
      options={[
        { name: '한국어', value: 'ko' },
        { name: 'English', value: 'en' },
        { name: '日本語', value: 'jp' },
      ]}
      current={current || 'ko'}
      onChanged={onChanged}
      variant="language"
    />
  );
};

export default LanguageSwitcher;
