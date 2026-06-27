import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">{t('page.notFound.title')}</p>
        <p className="mb-6 text-sm text-muted-foreground">{t('page.notFound.desc')}</p>
        <Link to="/" className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-primary-foreground hover:opacity-90">
          {t('page.notFound.goHome')}
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
