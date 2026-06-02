import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import TrazaApp from '@/components/TrazaApp';

export const metadata = {
  title: 'Trazá — Del parte al cobro, con trazabilidad',
  description:
    'Plataforma para médicos especialistas: extraé y validá partes quirúrgicos, facturá ante Swiss Medical y OSDE, y seguí el cobro con ARCA integrado.',
};

export default async function Page() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  return <TrazaApp />;
}
