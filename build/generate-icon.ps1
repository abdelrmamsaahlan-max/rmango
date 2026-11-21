# Generates the Rmango Windows icon as a 256x256 PNG-backed ICO.
# Uses only .NET System.Drawing available on Windows runners and Windows PCs.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$size = 512
$bitmap = [System.Drawing.Bitmap]::new(
  $size,
  $size,
  [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))

function New-RoundedPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

$tile = New-RoundedPath 10 10 492 492 112
$background = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 20, 25, 19))
$border = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 111, 145, 61), 8)
$graphics.FillPath($background, $tile)
$graphics.DrawPath($border, $tile)

$inner = New-RoundedPath 28 28 456 456 94
$innerBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 27, 36, 24))
$graphics.FillPath($innerBrush, $inner)

$font = [System.Drawing.Font]::new("Arial", 360, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$format = [System.Drawing.StringFormat]::new()
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$letterRect = [System.Drawing.RectangleF]::new(28, 10, 456, 484)
$shadow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 8, 12, 7))
$lime = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 203, 244, 105))
$shadowRect = [System.Drawing.RectangleF]::new(34, 18, 456, 484)
$graphics.DrawString("R", $font, $shadow, $shadowRect, $format)
$graphics.DrawString("R", $font, $lime, $letterRect, $format)

$leaf = [System.Drawing.PointF[]]@(
  [System.Drawing.PointF]::new(372, 88),
  [System.Drawing.PointF]::new(442, 56),
  [System.Drawing.PointF]::new(414, 132),
  [System.Drawing.PointF]::new(385, 149)
)
$leafBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 116, 166, 58))
$leafHighlight = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 208, 241, 109))
$graphics.FillPolygon($leafBrush, $leaf)
$leafInner = [System.Drawing.PointF[]]@(
  [System.Drawing.PointF]::new(383, 100),
  [System.Drawing.PointF]::new(430, 78),
  [System.Drawing.PointF]::new(408, 120)
)
$graphics.FillPolygon($leafHighlight, $leafInner)

$iconBitmap = [System.Drawing.Bitmap]::new(
  256,
  256,
  [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
)
$iconGraphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
$iconGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$iconGraphics.DrawImage($bitmap, 0, 0, 256, 256)

$stream = [System.IO.MemoryStream]::new()
$iconBitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $stream.ToArray()
$stream.Dispose()

# ICO directory header + one embedded 256x256 PNG frame.
$header = [byte[]]::new(22)
$header[0] = 0; $header[1] = 0
$header[2] = 1; $header[3] = 0
$header[4] = 1; $header[5] = 0
$header[6] = 0; $header[7] = 0 # 256 x 256 is encoded as 0 x 0
$header[8] = 0; $header[9] = 0
$header[10] = 1; $header[11] = 0
$header[12] = 32; $header[13] = 0
[Array]::Copy([BitConverter]::GetBytes([UInt32]$pngBytes.Length), 0, $header, 14, 4)
[Array]::Copy([BitConverter]::GetBytes([UInt32]22), 0, $header, 18, 4)

$icoBytes = [byte[]]::new(22 + $pngBytes.Length)
[Array]::Copy($header, 0, $icoBytes, 0, 22)
[Array]::Copy($pngBytes, 0, $icoBytes, 22, $pngBytes.Length)
$target = Join-Path $PSScriptRoot "icon.ico"
[System.IO.File]::WriteAllBytes($target, $icoBytes)

$iconGraphics.Dispose()
$iconBitmap.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
$background.Dispose()
$border.Dispose()
$innerBrush.Dispose()
$font.Dispose()
$format.Dispose()
$shadow.Dispose()
$lime.Dispose()
$leafBrush.Dispose()
$leafHighlight.Dispose()
$tile.Dispose()
$inner.Dispose()

Write-Host "Generated Rmango 256x256 Windows icon: $target"
Write-Host "ICO payload size: $($icoBytes.Length) bytes"
