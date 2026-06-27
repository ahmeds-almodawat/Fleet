import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { cn } from '@/lib/utils';
import { useBranding, DEFAULT_BRANDING } from '@/hooks/useBranding';
import { hexToRgba } from '@/lib/color';

export default function LoginPage() {
  const { t } = useTranslation();
  const isRtl = (i18n.language || '').startsWith('ar');
  const { branding } = useBranding();

  const brandTitle = isRtl
    ? (branding.brand_title_ar || DEFAULT_BRANDING.brand_title_ar)
    : (branding.brand_title_en || DEFAULT_BRANDING.brand_title_en);

  const brandSubtitle = isRtl
    ? (branding.brand_subtitle_ar || DEFAULT_BRANDING.brand_subtitle_ar)
    : (branding.brand_subtitle_en || DEFAULT_BRANDING.brand_subtitle_en);

  const bgClass = branding.login_bg_style === 'dark'
    ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800'
    : branding.login_bg_style === 'soft'
      ? 'bg-gradient-to-br from-primary/10 via-background to-accent/10'
      : 'bg-gradient-to-br from-primary/5 via-background to-accent/5';

  const textColor = branding.login_font_color || DEFAULT_BRANDING.login_font_color;

  const loginLogoUrl = branding.login_logo_url || DEFAULT_BRANDING.login_logo_url;
  const loginLogoSize = branding.login_logo_size ?? DEFAULT_BRANDING.login_logo_size ?? 72;
  const loginLogoOpacity = ((branding.login_logo_opacity ?? DEFAULT_BRANDING.login_logo_opacity ?? 100) as number) / 100;

  const loginLogoBgColor = (branding.loginLogoBgColor ?? DEFAULT_BRANDING.loginLogoBgColor ?? '#ffffff') as string;
  const loginLogoBgOpacity = ((branding.loginLogoBgOpacity ?? DEFAULT_BRANDING.loginLogoBgOpacity ?? 0) as number) / 100;

  const bgImageUrl = branding.login_bg_image_url || DEFAULT_BRANDING.login_bg_image_url;
  const overlayAlpha = ((branding.login_bg_overlay ?? DEFAULT_BRANDING.login_bg_overlay ?? 55) as number) / 100;
  const blurPx = (branding.login_bg_blur ?? DEFAULT_BRANDING.login_bg_blur ?? 2) as number;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      toast.error(t('auth.login.failedTitle'), { description: error.message || t('auth.login.failedDesc') });
    } else {
      toast.success(t('auth.login.successTitle'));
      navigate('/dashboard');
    }

    setLoading(false);
  };

  return (
    <div className={cn('min-h-svh relative overflow-hidden', bgClass)}>
      {/* Background image (system-wide) */}
      {bgImageUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bgImageUrl})` }}
          aria-hidden="true"
        />
      ) : null}

      {/* Government-style overlay for readability */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: `rgba(0,0,0,${overlayAlpha})`,
          backdropFilter: `blur(${blurPx}px)`,
          WebkitBackdropFilter: `blur(${blurPx}px)`,
        }}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative z-10 min-h-svh flex items-center justify-center p-4">
        <div className="w-full max-w-md animate-fade-in">
          <div className={cn('flex items-center justify-center gap-3 mb-8', isRtl && 'flex-row-reverse')}>
            <div
              className="rounded-xl bg-background/90 border border-border/50 flex items-center justify-center shadow-md overflow-hidden"
              style={{
                width: loginLogoSize,
                height: loginLogoSize,
                backgroundColor: hexToRgba(loginLogoBgColor, loginLogoBgOpacity),
              }}
            >
              {loginLogoUrl ? (
                <img
                  src={loginLogoUrl}
                  alt="logo"
                  className="h-full w-full object-contain p-2"
                  style={{ opacity: loginLogoOpacity }}
                />
              ) : (
                <Truck className="w-7 h-7 text-foreground" style={{ opacity: loginLogoOpacity }} />
              )}
            </div>
            <div className={cn(isRtl ? 'text-right' : 'text-left')}>
              <h1 className="text-2xl font-bold" style={{ color: textColor }}>
                {brandTitle || t('auth.brandTitle')}
              </h1>
              <p className="text-sm opacity-80" style={{ color: textColor }}>
                {brandSubtitle || t('auth.brandSubtitle')}
              </p>
            </div>
          </div>

          <Card className="border-border/50 shadow-lg bg-background/90 backdrop-blur">
            <CardHeader className="text-center">
              <CardTitle>{t('auth.login.title')}</CardTitle>
              <CardDescription>{t('auth.login.desc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('auth.login.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('auth.login.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('auth.login.password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className={cn('w-4 h-4 animate-spin', isRtl ? 'ml-2' : 'mr-2')} />}
                  {t('auth.login.submit')}
                </Button>
              </form>

            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
