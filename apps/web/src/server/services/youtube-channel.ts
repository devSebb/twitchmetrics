type YouTubeChannelResponse = {
  items?: Array<{ id?: string }>;
};

export async function getYouTubeChannelId(
  accessToken: string,
): Promise<string | null> {
  const response = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as YouTubeChannelResponse;
  const channelId = data.items?.[0]?.id;
  return typeof channelId === "string" ? channelId : null;
}
