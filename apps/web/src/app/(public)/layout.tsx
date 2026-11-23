import { Header, Footer } from "@/components/layout";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <a href="#main-content" className="n-skip-link n-button n-button-primary">
        Skip to content
      </a>
      <Header />
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-screen bg-[#2B2D31]"
      >
        {children}
      </main>
      <Footer />
    </>
  );
}
