// 抠像：用法生 mask（VNGenerateForegroundInstanceMaskRequest）→ 带 alpha 的 PNG
// swiftc -O cutout.swift -o cutout && ./cutout <in.jpg> <out.png>
import CoreImage
import Foundation
import ImageIO
import Vision

let args = CommandLine.arguments
guard args.count >= 3 else { FileHandle.standardError.write("usage: cutout in.jpg out.png\n".data(using: .utf8)!); exit(2) }
let inURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])

guard let src = CGImageSourceCreateWithURL(inURL as CFURL, nil),
      let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
    FileHandle.standardError.write("cannot read input\n".data(using: .utf8)!); exit(10)
}

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
let req = VNGenerateForegroundInstanceMaskRequest()
do { try handler.perform([req]) } catch {
    FileHandle.standardError.write("vision failed: \(error)\n".data(using: .utf8)!); exit(11)
}
guard let obs = req.results?.first else {
    FileHandle.standardError.write("no subject found\n".data(using: .utf8)!); exit(12)
}

let buffer: CVPixelBuffer
do {
    buffer = try obs.generateMaskedImage(ofInstances: obs.allInstances, from: handler, croppedToInstancesExtent: false)
} catch {
    FileHandle.standardError.write("mask failed: \(error)\n".data(using: .utf8)!); exit(13)
}

let ci = CIImage(cvPixelBuffer: buffer)
let ctx = CIContext()
guard let out = ctx.createCGImage(ci, from: ci.extent) else { exit(14) }
guard let dest = CGImageDestinationCreateWithURL(outURL as CFURL, "public.png" as CFString, 1, nil) else { exit(15) }
CGImageDestinationAddImage(dest, out, nil)
if !CGImageDestinationFinalize(dest) { exit(16) }
print("ok \(out.width)x\(out.height) -> \(args[2])")
