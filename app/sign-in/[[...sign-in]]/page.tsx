import { SignIn } from '@clerk/nextjs';
import { AuthPageShell } from '@/components/auth/AuthPageShell';

export default function SignInPage() {
  return (
    <AuthPageShell>
      <SignIn />
    </AuthPageShell>
  );
}
