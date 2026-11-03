import { decode } from 'base64-arraybuffer';
import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { InquiryDB } from 'types/database';
import {
  INQUIRY_IMAGE_BUCKET,
  type InquiryImageMimeType,
  makeInquiryImagePath,
  randomImageId,
} from 'utils/inquiryImages';
import { showNetworkErrorToast } from 'utils/network';
import { captureError, isNetworkError, sendError } from 'utils/sendError';
import { showErrorToast, showSuccessToast } from 'utils/showToast';
import { Maybe } from '../types/common';

const selectAll = async () =>
  sendError<InquiryDB[]>(async () => {
    const userId = useUserStore.getState().id;

    const { data, error } = await supabase
      .from('inquiry')
      .select('*')
      .eq('uid', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data;
  });

const selectOneById = async (id: number) =>
  sendError<Maybe<InquiryDB>>(async () => {
    const userId = useUserStore.getState().id;

    const { data, error } = await supabase
      .from('inquiry')
      .select('*')
      .eq('id', id)
      .eq('uid', userId)
      .maybeSingle();

    if (error) throw error;

    return data;
  });

const insert = async (inquiry: Partial<InquiryDB>) =>
  sendError<InquiryDB>(async () => {
    const { data, error } = await supabase
      .from('inquiry')
      .insert({ ...inquiry })
      .select()
      .single();

    if (error) throw error;

    showSuccessToast({ textType: 'MAKE_INQUIRY_SUCCESS' });

    return data;
  });

export interface InquiryImageUpload {
  base64: string;
  mimeType: InquiryImageMimeType;
}

// 사진을 모두 올리고 경로를 돌려준다. 하나라도 실패하면 안내 후 null (문의는 보내지 않는다).
// 먼저 올라간 사진은 지우지 않는다 (본인 폴더에만 남고 어디서도 가리키지 않는다)
const uploadImages = async (images: InquiryImageUpload[]): Promise<string[] | null> => {
  if (images.length === 0) return [];
  try {
    const userId = useUserStore.getState().id;
    if (!userId) throw new Error('no user id');

    const paths: string[] = [];
    for (const image of images) {
      const path = makeInquiryImagePath(userId, randomImageId(), image.mimeType);
      const { error } = await supabase.storage
        .from(INQUIRY_IMAGE_BUCKET)
        .upload(path, decode(image.base64), { contentType: image.mimeType, upsert: false });
      if (error) throw error;
      paths.push(path);
    }
    return paths;
  } catch (error) {
    console.error('[InquiryAPI.uploadImages]', error);
    captureError({ error, prefix: '[InquiryAPI.uploadImages]: ' });
    if (isNetworkError(error)) {
      showNetworkErrorToast();
      return null;
    }
    showErrorToast({
      textType: 'CUSTOM',
      title: '사진을 올리지 못했어요',
      subtitle: '잠시 후 다시 보내 주세요',
    });
    return null;
  }
};

const IMAGE_URL_EXPIRES_IN = 60 * 60;

// 내 문의 사진 보기용 링크. 실패한 사진은 빼고 돌려준다
const signImages = async (paths: string[]): Promise<string[]> => {
  if (paths.length === 0) return [];
  const { data, error } = await supabase.storage
    .from(INQUIRY_IMAGE_BUCKET)
    .createSignedUrls(paths, IMAGE_URL_EXPIRES_IN);
  if (error || !data) {
    console.error('[InquiryAPI.signImages]', error);
    return [];
  }
  return data
    .filter((item) => item.signedUrl && !item.error)
    .map((item) => item.signedUrl as string);
};

export const InquiryAPI = {
  selectAll,
  selectOneById,
  insert,
  uploadImages,
  signImages,
};
