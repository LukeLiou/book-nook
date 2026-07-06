import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';

export interface EpubMeta {
  title: string;
  author?: string;
  coverDataUrl?: string;
}

function findMetaValue(doc: Document, name: string): string {
  const nodes = doc.getElementsByTagName('meta');
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes.item(i);
    if (!node) {
      continue;
    }
    const n = node.getAttribute('name') || node.getAttribute('property');
    if (n === name) {
      return node.getAttribute('content')?.trim() ?? '';
    }
  }
  return '';
}

export async function parseEpubMeta(filePath: string): Promise<EpubMeta> {
  const buffer = await fs.promises.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const containerEntry = zip.file('META-INF/container.xml');
  if (!containerEntry) {
    return { title: path.basename(filePath, '.epub') };
  }

  const containerXml = await containerEntry.async('text');
  const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml');
  const rootfile = containerDoc.getElementsByTagName('rootfile')[0];
  const opfPath = rootfile?.getAttribute('full-path');
  if (!opfPath) {
    return { title: path.basename(filePath, '.epub') };
  }

  const opfEntry = zip.file(opfPath);
  if (!opfEntry) {
    return { title: path.basename(filePath, '.epub') };
  }

  const opfXml = await opfEntry.async('text');
  const opfDoc = new DOMParser().parseFromString(opfXml, 'text/xml');
  const opfDir = path.posix.dirname(opfPath);

  const title =
    findMetaValue(opfDoc, 'dc:title') ||
    findMetaValue(opfDoc, 'title') ||
    path.basename(filePath, '.epub');
  const author =
    findMetaValue(opfDoc, 'dc:creator') ||
    findMetaValue(opfDoc, 'creator') ||
    undefined;

  let coverDataUrl: string | undefined;
  const manifest = opfDoc.getElementsByTagName('item');
  let coverHref: string | undefined;

  for (let i = 0; i < manifest.length; i++) {
    const item = manifest.item(i);
    if (!item) {
      continue;
    }
    const props = item.getAttribute('properties') ?? '';
    if (props.includes('cover-image')) {
      coverHref = item.getAttribute('href') ?? undefined;
      break;
    }
    if (item.getAttribute('id') === 'cover-image' || item.getAttribute('id') === 'cover') {
      coverHref = item.getAttribute('href') ?? undefined;
    }
  }

  if (!coverHref) {
    const metaCover = opfDoc.getElementsByTagName('meta');
    for (let i = 0; i < metaCover.length; i++) {
      const m = metaCover.item(i);
      if (m?.getAttribute('name') === 'cover') {
        const coverId = m.getAttribute('content');
        for (let j = 0; j < manifest.length; j++) {
          const item = manifest.item(j);
          if (item?.getAttribute('id') === coverId) {
            coverHref = item.getAttribute('href') ?? undefined;
            break;
          }
        }
      }
    }
  }

  if (coverHref) {
    const coverPath = path.posix.normalize(path.posix.join(opfDir, coverHref));
    const coverEntry = zip.file(coverPath);
    if (coverEntry) {
      const coverBuf = await coverEntry.async('nodebuffer');
      const ext = path.extname(coverPath).toLowerCase();
      const mime =
        ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
      coverDataUrl = `data:${mime};base64,${coverBuf.toString('base64')}`;
    }
  }

  return { title, author, coverDataUrl };
}
