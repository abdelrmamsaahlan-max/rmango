# Creates the Rmango mango app icon as a 256x256 PNG-backed Windows ICO.
# Runs on Windows using the .NET System.Drawing assembly.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

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

$size = 512
$bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.Clear([System.Drawing.Color]::Transparent)

# Deep green rounded tile.
$tile = New-RoundedPath 10 10 492 492 112
$tileBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Rectangle]::new(0, 0, 512, 512),
  [System.Drawing.Color]::FromArgb(255, 34, 59, 34),
  [System.Drawing.Color]::FromArgb(255, 10, 28, 18),
  [single]42
)
$tileBorder = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 118, 157, 68), 7)
$graphics.FillPath($tileBrush, $tile)
$graphics.DrawPath($tileBorder, $tile)

# Mango fruit silhouette.
$fruit = [System.Drawing.Drawing2D.GraphicsPath]::new()
$fruit.AddBezier(250, 124, 166, 99, 104, 181, 132, 279)
$fruit.AddBezier(132, 279, 151, 353, 217, 411, 286, 385)
$fruit.AddBezier(286, 385, 363, 356, 423, 276, 386, 193)
$fruit.AddBezier(386, 193, 356, 130, 300, 111, 250, 124)
$fruit.CloseFigure()
$fruitBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Rectangle]::new(115, 110, 300, 300),
  [System.Drawing.Color]::FromArgb(255, 255, 230, 115),
  [System.Drawing.Color]::FromArgb(255, 237, 148, 30),
  [single]40
)
$fruitOutline = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 255, 216, 95), 4)
$graphics.FillPath($fruitBrush, $fruit)
$graphics.DrawPath($fruitOutline, $fruit)

# Soft golden highlight on the upper-left curve.
$shine = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(125, 255, 255, 222), 13)
$shine.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$shine.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawArc($shine, 145, 145, 150, 170, 196, 105)

# Green leaf and short curved stem.
$leaf = [System.Drawing.Drawing2D.GraphicsPath]::new()
$leaf.AddBezier(265, 135, 270, 68, 344, 44, 408, 75)
$leaf.AddBezier(408, 75, 388, 136, 332, 163, 265, 135)
$leaf.CloseFigure()
$leafBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Rectangle]::new(255, 42, 170, 125),
  [System.Drawing.Color]::FromArgb(255, 184, 228, 111),
  [System.Drawing.Color]::FromArgb(255, 49, 132, 65),
  [single]28
)
$leafOutline = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 27, 83, 46), 4)
$graphics.FillPath($leafBrush, $leaf)
$graphics.DrawPath($leafOutline, $leaf)
$vein = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(190, 33, 101, 53), 4)
$vein.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$vein.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawBezier($vein, 276, 131, 321, 105, 358, 89, 391, 82)

# RMango robot visor and friendly glowing eyes.
$visor = New-RoundedPath 151 204 210 126 48
$visorBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Rectangle]::new(151, 204, 210, 126),
  [System.Drawing.Color]::FromArgb(255, 37, 52, 77),
  [System.Drawing.Color]::FromArgb(255, 7, 14, 30),
  [single]90
)
$visorPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 9, 13, 23), 10)
$graphics.FillPath($visorBrush, $visor)
$graphics.DrawPath($visorPen, $visor)

# Curved white eyes, matching the uploaded mascot's friendly expression.
$eyePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 255, 255, 255), 13)
$eyePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$eyePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawArc($eyePen, 193, 246, 63, 54, 190, 160)
$graphics.DrawArc($eyePen, 258, 246, 63, 54, 190, 160)

# Soft ivory headphone pads on both sides of the fruit.
$padBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 248, 239, 226))
$padPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 16, 18, 25), 7)
$leftPad = New-RoundedPath 103 220 47 132 17
$rightPad = New-RoundedPath 362 220 47 132 17
$graphics.FillPath($padBrush, $leftPad)
$graphics.DrawPath($padPen, $leftPad)
$graphics.FillPath($padBrush, $rightPad)
$graphics.DrawPath($padPen, $rightPad)

# Tiny golden sparkle to make the mark readable at taskbar size.
$sparkBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 255, 236, 151))
$graphics.FillEllipse($sparkBrush, 390, 350, 13, 13)

# Render an actual 256x256 frame before embedding it in the ICO.
$iconBitmap = [System.Drawing.Bitmap]::new(256, 256, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$iconGraphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
$iconGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$iconGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
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
$header[6] = 0; $header[7] = 0
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
$tile.Dispose()
$tileBrush.Dispose()
$tileBorder.Dispose()
$fruit.Dispose()
$fruitBrush.Dispose()
$fruitOutline.Dispose()
$shine.Dispose()
$leaf.Dispose()
$leafBrush.Dispose()
$leafOutline.Dispose()
$vein.Dispose()
$sparkBrush.Dispose()
$visor.Dispose()
$visorBrush.Dispose()
$visorPen.Dispose()
$eyePen.Dispose()
$padBrush.Dispose()
$padPen.Dispose()
$leftPad.Dispose()
$rightPad.Dispose()

Write-Host "Generated Rmango mango icon (256x256): $target"
Write-Host "ICO payload size: $($icoBytes.Length) bytes"
