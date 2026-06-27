import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, User, Pencil } from 'lucide-react';
import { toast } from 'sonner';

interface UserProfile {
  id: string;
  staff_id: string;
  name_en: string;
  name_ar: string;
  job_title: string;
  phone: string | null;
  active: boolean;
  is_driver?: boolean;
  department: { name: string } | null;
  roles: { role: { id: string; name: string } }[];
}

interface Role {
  id: string;
  name: string;
  description: string | null;
}

interface Department {
  id: string;
  name: string;
}

export default function UsersPage() {
  const { hasPermission } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [isDriver, setIsDriver] = useState<boolean>(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newStaffId, setNewStaffId] = useState('');
  const [newNameEn, setNewNameEn] = useState('');
  const [newNameAr, setNewNameAr] = useState('');
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newDeptId, setNewDeptId] = useState<string>('');
  const [newIsDriver, setNewIsDriver] = useState<boolean>(false);
  const [newRoles, setNewRoles] = useState<string[]>([]);

  const canEdit = hasPermission('users.edit');
  const canDisable = hasPermission('users.disable');
  const canCreate = hasPermission('users.create');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [usersRes, rolesRes, deptsRes] = await Promise.all([
      supabase.from('profiles')
        .select('*, department:departments(name), roles:user_roles(role:roles(id, name))')
        .order('name_en'),
      supabase.from('roles').select('*').order('name'),
      supabase.from('departments').select('*').order('name'),
    ]);

    if (usersRes.data) setUsers(usersRes.data as UserProfile[]);
    if (rolesRes.data) setRoles(rolesRes.data);
    if (deptsRes.data) setDepartments(deptsRes.data);
    setLoading(false);
  };

  const handleEditRoles = (user: UserProfile) => {
    setEditingUser(user);
    setSelectedRoles(user.roles.map(r => r.role.id));
    setIsDriver(!!user.is_driver);
    setDialogOpen(true);
  };

  const handleSaveRoles = async () => {
    if (!editingUser) return;

    // Update driver flag
    await supabase.from('profiles').update({ is_driver: isDriver }).eq('id', editingUser.id);

    // Delete existing roles
    await supabase.from('user_roles').delete().eq('user_id', editingUser.id);

    // Insert new roles
    if (selectedRoles.length > 0) {
      const { error } = await supabase.from('user_roles').insert(
        selectedRoles.map(roleId => ({
          user_id: editingUser.id,
          role_id: roleId,
        }))
      );

      if (error) {
        toast.error('Failed to update roles');
        return;
      }
    }

    toast.success('Roles updated successfully');
    setDialogOpen(false);
    fetchData();
  };

  const toggleNewRole = (roleId: string) => {
    setNewRoles(prev => prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]);
  };

  const handleCreateUser = async () => {
    if (!newEmail || !newPassword || !newStaffId || !newNameEn || !newNameAr || !newJobTitle) {
      toast.error('Please fill required fields');
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: newEmail.trim(),
          password: newPassword,
          staff_id: newStaffId.trim(),
          name_en: newNameEn.trim(),
          name_ar: newNameAr.trim(),
          job_title: newJobTitle.trim(),
          phone: newPhone?.trim() || null,
          department_id: newDeptId || null,
          is_driver: newIsDriver,
          role_ids: newRoles,
        },
      });
      if (error) throw error;
      toast.success('User created');
      setCreateOpen(false);
      setNewEmail('');
      setNewPassword('');
      setNewStaffId('');
      setNewNameEn('');
      setNewNameAr('');
      setNewJobTitle('');
      setNewPhone('');
      setNewDeptId('');
      setNewIsDriver(false);
      setNewRoles([]);
      fetchData();
    } catch (e: any) {
      toast.error('Failed to create user', { description: e?.message });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (user: UserProfile) => {
    const { error } = await supabase.from('profiles')
      .update({ active: !user.active })
      .eq('id', user.id);

    if (error) {
      toast.error('Failed to update user status');
    } else {
      toast.success(user.active ? 'User deactivated' : 'User activated');
      fetchData();
    }
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoles(prev => 
      prev.includes(roleId) 
        ? prev.filter(id => id !== roleId)
        : [...prev, roleId]
    );
  };

  const filteredUsers = users.filter(u =>
    u.name_en.toLowerCase().includes(search.toLowerCase()) ||
    u.name_ar.includes(search) ||
    u.staff_id.toLowerCase().includes(search.toLowerCase()) ||
    u.job_title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <MainLayout>
      <PageHeader title="Users" description="Manage system users and their roles" />

      {canCreate && (
        <div className="flex justify-end mb-4">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        </div>
      )}

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, staff ID, or job title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((user) => (
            <Card key={user.id} className={!user.active ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                      <User className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{user.name_en}</p>
                        <span className="text-muted-foreground" dir="rtl">({user.name_ar})</span>
                        {!user.active && <StatusBadge status="OutOfService" />}
                      </div>
                      <p className="text-sm text-muted-foreground">{user.staff_id} • {user.job_title}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {user.roles.map(r => (
                          <span key={r.role.id} className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded-full">
                            {r.role.name}
                          </span>
                        ))}
                        {user.roles.length === 0 && (
                          <span className="text-xs text-muted-foreground italic">No roles assigned</span>
                        )}
                        {user.is_driver && (
                          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-700 text-xs rounded-full">
                            Driver
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <Button variant="outline" size="sm" onClick={() => handleEditRoles(user)}>
                        <Pencil className="w-4 h-4 mr-1" />
                        Edit Roles
                      </Button>
                    )}
                    {canDisable && (
                      <Button 
                        variant={user.active ? "outline" : "default"} 
                        size="sm"
                        onClick={() => handleToggleActive(user)}
                      >
                        {user.active ? 'Deactivate' : 'Activate'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Roles Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Roles for {editingUser?.name_en}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select the roles to assign to this user:</p>
            <div className="flex items-center gap-2">
              <Checkbox checked={isDriver} onCheckedChange={(v: any) => setIsDriver(!!v)} />
              <span className="text-sm">Driver</span>
            </div>
            <div className="space-y-3">
              {roles.map((role) => (
                <div key={role.id} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50">
                  <Checkbox
                    id={role.id}
                    checked={selectedRoles.includes(role.id)}
                    onCheckedChange={() => toggleRole(role.id)}
                  />
                  <div>
                    <label htmlFor={role.id} className="font-medium cursor-pointer">{role.name}</label>
                    {role.description && (
                      <p className="text-sm text-muted-foreground">{role.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRoles}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@company.com" />
              </div>
              <div className="space-y-2">
                <Label>Temp Password *</Label>
                <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Temporary password" type="password" />
              </div>
              <div className="space-y-2">
                <Label>Staff ID *</Label>
                <Input value={newStaffId} onChange={(e) => setNewStaffId(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Job Title *</Label>
                <Input value={newJobTitle} onChange={(e) => setNewJobTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Name (EN) *</Label>
                <Input value={newNameEn} onChange={(e) => setNewNameEn(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Name (AR) *</Label>
                <Input value={newNameAr} onChange={(e) => setNewNameAr(e.target.value)} dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="05xxxxxxxx" />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={newDeptId} onValueChange={setNewDeptId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox checked={newIsDriver} onCheckedChange={(v: any) => setNewIsDriver(!!v)} />
              <span className="text-sm">Driver</span>
            </div>

            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="grid grid-cols-2 gap-2">
                {roles.map((role) => (
                  <label key={role.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={newRoles.includes(role.id)} onCheckedChange={() => toggleNewRole(role.id)} />
                    <span>{role.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateUser} disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}