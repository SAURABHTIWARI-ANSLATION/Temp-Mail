import './globals.css'

export const metadata = {
  title: 'TempMail Standalone',
  description: 'Standalone temporary email inbox with iframe-ready UI.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
