import { SignUp } from '@clerk/nextjs';
import { AuthPageShell } from '@/components/auth/AuthPageShell';

export default function SignUpPage() {
  return (
    <AuthPageShell>
      <SignUp />
    </AuthPageShell>
  );
}
