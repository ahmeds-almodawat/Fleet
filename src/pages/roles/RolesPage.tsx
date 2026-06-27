import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Shield, Pencil, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: { permission: { id: string; key: string; name: string; category: string } }[];
}

interface Permission {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
}

export default function RolesPage() {
  const { hasPermission } = useAuth();
  const { t } = useTranslation();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const canCreate = hasPermission('roles.create');
  const canEdit = hasPermission('roles.edit');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [rolesRes, permsRes] = await Promise.all([
      supabase.from('roles')
        .select('*, permissions:role_permissions(permission:permissions(id, key, name, category))')
        .order('name'),
      supabase.from('permissions').select('*').order('category, name'),
    ]);

    if (rolesRes.data) setRoles(rolesRes.data as Role[]);
    if (permsRes.data) setPermissions(permsRes.data);
    setLoading(false);
  };

  const handleOpenDialog = (role?: Role) => {
    if (role) {
      setEditingRole(role);
      setRoleName(role.name);
      setRoleDescription(role.description || '');
      setSelectedPermissions(role.permissions.map(p => p.permission.id));
    } else {
      setEditingRole(null);
      setRoleName('');
      setRoleDescription('');
      setSelectedPermissions([]);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!roleName) return;

    try {
      let roleId: string;

      if (editingRole) {
        const { error } = await supabase.from('roles')
          .update({ name: roleName, description: roleDescription || null })
          .eq('id', editingRole.id);
        if (error) throw error;
        roleId = editingRole.id;

        // Delete existing permissions
        await supabase.from('role_permissions').delete().eq('role_id', roleId);
      } else {
        const { data, error } = await supabase.from('roles')
          .insert({ name: roleName, description: roleDescription || null })
          .select()
          .single();
        if (error) throw error;
        roleId = data.id;
      }

      // Insert permissions
      if (selectedPermissions.length > 0) {
        const { error } = await supabase.from('role_permissions').insert(
          selectedPermissions.map(permId => ({
            role_id: roleId,
            permission_id: permId,
          }))
        );
        if (error) throw error;
      }

      toast.success(editingRole ? 'Role updated' : 'Role created');
      setDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error('Failed to save role', { description: error.message });
    }
  };

  const togglePermission = (permId: string) => {
    setSelectedPermissions(prev =>
      prev.includes(permId)
        ? prev.filter(id => id !== permId)
        : [...prev, permId]
    );
  };

  const toggleCategory = (category: string) => {
    const categoryPermIds = permissions.filter(p => p.category === category).map(p => p.id);
    const allSelected = categoryPermIds.every(id => selectedPermissions.includes(id));
    
    if (allSelected) {
      setSelectedPermissions(prev => prev.filter(id => !categoryPermIds.includes(id)));
    } else {
      setSelectedPermissions(prev => [...new Set([...prev, ...categoryPermIds])]);
    }
  };

  const groupedPermissions = permissions.reduce((acc, perm) => {
    if (!acc[perm.category]) acc[perm.category] = [];
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <MainLayout>
        <PageHeader title={t('roles.title')} description={t('roles.description')}>
        {canCreate && (
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="w-4 h-4 mr-2" />
            {t('roles.createRole')}
          </Button>
        )}
      </PageHeader>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((role) => (
            <Card key={role.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{role.name}</CardTitle>
                      {role.description && (
                        <p className="text-sm text-muted-foreground">{role.description}</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1 mb-4">
                  {role.permissions.slice(0, 5).map(p => (
                    <span key={p.permission.id} className="px-2 py-0.5 bg-muted text-xs rounded">
                      {p.permission.name}
                    </span>
                  ))}
                  {role.permissions.length > 5 && (
                    <span className="px-2 py-0.5 bg-muted text-xs rounded">
                      +{role.permissions.length - 5} more
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{role.permissions.length} permissions</span>
                  {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(role)}>
                      <Pencil className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Role Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Edit Role' : 'Create New Role'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('roles.roleName')} *</Label>
                <Input
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder={t('roles.roleNamePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('common.description')}</Label>
                <Input
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                  placeholder={t('common.briefDescription')}
                />
              </div>
            </div>

            <div className="space-y-4">
              <Label>{t('roles.permissions')}</Label>
              {Object.entries(groupedPermissions).map(([category, perms]) => {
                const allSelected = perms.every(p => selectedPermissions.includes(p.id));
                const someSelected = perms.some(p => selectedPermissions.includes(p.id));

                return (
                  <div key={category} className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={() => toggleCategory(category)}
                        className={someSelected && !allSelected ? 'opacity-50' : ''}
                      />
                      <span className="font-medium">{category}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 ml-6">
                      {perms.map((perm) => (
                        <div key={perm.id} className="flex items-center gap-2">
                          <Checkbox
                            id={perm.id}
                            checked={selectedPermissions.includes(perm.id)}
                            onCheckedChange={() => togglePermission(perm.id)}
                          />
                          <label htmlFor={perm.id} className="text-sm cursor-pointer">
                            {perm.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSave} disabled={!roleName}>
              {editingRole ? t('roles.updateRole') : t('roles.createRole')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}