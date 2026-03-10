// TODO: needs generateMetadata for SEO
export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // TODO: implement public game page (SSR)
  return (
    <div className="px-6 py-10">
      <h1 className="text-3xl font-bold">Game: {slug}</h1>
    </div>
  )
}
