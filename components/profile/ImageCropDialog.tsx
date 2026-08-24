"use client"

import { useState } from "react"
import Cropper, { Area } from "react-easy-crop"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

interface ImageCropDialogProps {
  open: boolean
  image: string
  aspect: number
  title?: string

  onClose: () => void
  onCropComplete: (file: File) => void
}

export default function ImageCropDialog({
  open,
  image,
  aspect,
  title = "Crop Image",
  onClose,
  onCropComplete,
}: ImageCropDialogProps) {
  const [crop, setCrop] = useState({
    x: 0,
    y: 0,
  })

  const [zoom, setZoom] = useState(1)

  const [croppedAreaPixels, setCroppedAreaPixels] =
    useState<Area | null>(null)


  const handleCropComplete = (
    _: Area,
    croppedPixels: Area
  ) => {
    setCroppedAreaPixels(croppedPixels)
  }


  async function createCroppedImage() {
    if (!croppedAreaPixels) return
    const croppedFile = await getCroppedImg(image, croppedAreaPixels)
    onCropComplete(croppedFile)
  }


  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {title}
          </DialogTitle>
        </DialogHeader>


        <div className="relative h-[400px] w-full overflow-hidden rounded-lg bg-black">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>


        <div className="space-y-2">
          <p className="text-sm">
            Zoom
          </p>

          <Slider
            value={[zoom]}
            min={1}
            max={3}
            step={0.1}
            onValueChange={(value) =>
              setZoom(value[0])
            }
          />
        </div>


        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>

          <Button
            onClick={createCroppedImage}
          >
            Save Crop
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  )
}



/**
 * Creates a cropped File from the selected image
 */
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area
): Promise<File> {

  const image = await createImage(imageSrc)

  const canvas = document.createElement("canvas")

  const ctx = canvas.getContext("2d")

  if (!ctx) {
    throw new Error("Canvas not supported")
  }


  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height


  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  )


  return new Promise((resolve) => {

    canvas.toBlob((blob) => {

      if (!blob) {
        throw new Error("Crop failed")
      }


      const file = new File(
        [blob],
        "cropped-image.jpg",
        {
          type: "image/jpeg",
        }
      )


      resolve(file)

    }, "image/jpeg")

  })
}



function createImage(
  url: string
): Promise<HTMLImageElement> {

  return new Promise((resolve, reject) => {

    const img = new Image()

    img.addEventListener(
      "load",
      () => resolve(img)
    )

    img.addEventListener(
      "error",
      (error) => reject(error)
    )

    img.setAttribute(
      "crossOrigin",
      "anonymous"
    )

    img.src = url

  })
}