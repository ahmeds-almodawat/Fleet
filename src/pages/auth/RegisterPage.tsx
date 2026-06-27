import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Truck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { cn } from '@/lib/utils';

interface Department {
  id: string;
  name: string;
}

export default function RegisterPage() {
  const { t } = useTranslation();
  const isRtl = (i18n.language || '').startsWith('ar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [staffId, setStaffId] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDepartments = async () => {
      const { data } = await supabase.from('departments').select('*').order('name');
      if (data) setDepartments(data);
    };
    fetchDepartments();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await signUp(email, password, {
      staff_id: staffId,
      name_en: nameEn,
      name_ar: nameAr,
      job_title: jobTitle,
      phone: phone || null,
      department_id: departmentId || null,
    });

    if (error) {
      toast.error(t('auth.register.failedTitle'), { description: error.message || t('auth.register.failedDesc') });
    } else {
      toast.success(t('auth.register.successTitle'), {
        description: t('auth.register.successDesc'),
      });
      navigate('/login');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center p-4">
      <div className="w-full max-w-lg animate-fade-in">
        <div className={cn("flex items-center justify-center gap-3 mb-8", isRtl && "flex-row-reverse")}>
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <Truck className="w-7 h-7 text-primary-foreground" />
          </div>
          <div className={cn(isRtl ? 'text-right' : 'text-left')}>
            <h1 className="text-2xl font-bold text-foreground">{t('auth.brandTitle')}</h1>
            <p className="text-sm text-muted-foreground">{t('auth.brandSubtitle')}</p>
          </div>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="text-center">
            <CardTitle>{t('auth.register.title')}</CardTitle>
            <CardDescription>{t('auth.register.desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="staffId">{t('auth.register.staffId')} *</Label>
                  <Input
                    id="staffId"
                    placeholder="EMP001"
                    value={staffId}
                    onChange={(e) => setStaffId(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jobTitle">{t('auth.register.jobTitle')} *</Label>
                  <Input
                    id="jobTitle"
                    placeholder={t('auth.register.jobTitlePlaceholder')}
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nameEn">{t('auth.register.nameEn')} *</Label>
                  <Input
                    id="nameEn"
                    placeholder="John Doe"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nameAr">{t('auth.register.nameAr')} *</Label>
                  <Input
                    id="nameAr"
                    placeholder="جون دو"
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    required
                    dir="rtl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('auth.login.email')} *</Label>
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
                  <Label htmlFor="phone">{t('auth.register.phone')}</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder={t('auth.register.phonePlaceholder')}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password">{t('auth.login.password')} *</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">{t('auth.register.department')}</Label>
                  <Select value={departmentId} onValueChange={setDepartmentId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('auth.register.selectDepartment')} />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className={cn("w-4 h-4 animate-spin", isRtl ? "ml-2" : "mr-2")} />}
                {t('auth.register.submit')}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-4">
              {t('auth.register.haveAccount')}{' '}
              <Link to="/login" className="text-accent hover:underline">
                {t('auth.register.signIn')}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}