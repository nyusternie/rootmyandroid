// src/lib/device-markdown.js — builds the raw-Markdown alternate of a device
// entry, served prerendered at /device/<id>.md (endpoint:
// src/pages/device/[...id].md.ts; content-type enforced by public/_headers).
// Pure (unit-tested in src/lib/device-markdown.test.js): the endpoint feeds
// it the collection entry. Facts only, mirroring the page — every line maps
// to a rendered section of src/layouts/Device.astro.
export function buildDeviceMarkdown(device) {
  const d = device.data
  const lines = [
    `# ${d.title}`,
    '',
    `> Device facts and download links for the ${d.title} (codename ${d.codename}).`,
    '',
    `Source: https://rootmyandroid.com/device/${device.id}/`,
    `Brand: ${d.oem}`,
    `Codename: ${d.codename}`,
    `Official TWRP support status: ${d.supportstatus}`,
  ]
  if (d.maintainer.length > 0) {
    lines.push(`Maintainer: ${d.maintainer.join(', ')}`)
  }
  if (d.devicetree) {
    lines.push(`Device tree: ${d.devicetree}`)
  }
  if (d.downloadfolder) {
    lines.push(`TWRP download (Americas): https://dl.twrp.me/${d.downloadfolder}/`)
    lines.push(`TWRP download (Europe): https://eu.dl.twrp.me/${d.downloadfolder}/`)
  }
  if (d.variants && d.variants.length > 0) {
    lines.push('TWRP variants:')
    for (const variant of d.variants) {
      lines.push(
        `- ${variant.label} (${variant.folder}): https://dl.twrp.me/${variant.folder}/ | https://eu.dl.twrp.me/${variant.folder}/`,
      )
    }
  }
  if (d.factoryimages) {
    lines.push(`Factory images: ${d.factoryimages}`)
  }
  if (d.notes) {
    lines.push(`Notes: ${d.notes}`)
  }
  lines.push(`Listed: ${d.updated.toISOString().slice(0, 10)}`)
  return lines.join('\n') + '\n'
}
