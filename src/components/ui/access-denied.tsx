import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function AccessDenied({ titleKey, descKey }: { titleKey?: string; descKey?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border bg-card p-8 text-center">
      <ShieldAlert className="h-10 w-10 opacity-70" />
      <div className="mt-3 text-lg font-semibold">{t(titleKey || 'studio.noAccessTitle')}</div>
      <div className="mt-1 max-w-xl text-sm text-muted-foreground">{t(descKey || 'common.noAccess')}</div>
    </div>
  );
}
