import type { Metadata } from "next"
import { Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif",
})

export const metadata: Metadata = {
  title: "Traza - MVP",
  description: "Analiza documentos medicos y detecta errores antes de presentar",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}>
      <body className="bg-background">{children}</body>
    </html>
  )
}
