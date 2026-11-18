let photo: Promise<HTMLImageElement> | undefined;
export async function samplePaperImage() {
  photo ??= (async () => {
    const img = new Image();
    img.src = import.meta.env.BASE_URL + "papers/m87.jpg";
    await img.decode();
    return img;
  })().catch((e) => {
    photo = undefined;
    throw e;
  });
  return photo;
}
