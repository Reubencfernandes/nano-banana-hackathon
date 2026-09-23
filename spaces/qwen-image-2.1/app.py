"""
Qwen-Image-2.1 Gradio Space.

Exposes a single API endpoint, `/edit`, used by the Portrait Editor:
  - with an input image  -> image editing
  - without an image     -> text-to-image
Optional reference images (e.g. a clothing reference or a custom background)
are passed to the pipeline after the input image, in order, so prompts can
refer to them as the second / third image.
"""

import random

import gradio as gr
import spaces
import torch
from diffusers import QwenImage21Pipeline

MODEL_ID = "Qwen/Qwen-Image-2.1"
MAX_SEED = 2**31 - 1

pipe = QwenImage21Pipeline.from_pretrained(MODEL_ID, torch_dtype=torch.bfloat16).to("cuda")


@spaces.GPU(duration=120)
def edit(image, prompt, seed=-1, steps=40, reference_1=None, reference_2=None):
    if not prompt or not prompt.strip():
        raise gr.Error("A prompt is required.")

    seed = int(seed)
    if seed < 0:
        seed = random.randint(0, MAX_SEED)
    generator = torch.Generator("cuda").manual_seed(seed)

    kwargs = dict(prompt=prompt, num_inference_steps=int(steps), generator=generator)
    if image is not None:
        references = [r for r in (reference_1, reference_2) if r is not None]
        images = [img.convert("RGB") for img in [image, *references]]
        kwargs["image"] = images if len(images) > 1 else images[0]

    return pipe(**kwargs).images[0]


demo = gr.Interface(
    fn=edit,
    inputs=[
        gr.Image(type="pil", label="Input image (optional - leave empty for text-to-image)"),
        gr.Textbox(label="Prompt", lines=3),
        gr.Number(value=-1, precision=0, label="Seed (-1 = random)"),
        gr.Slider(10, 60, value=40, step=1, label="Steps"),
        gr.Image(type="pil", label="Reference image 1 (optional)"),
        gr.Image(type="pil", label="Reference image 2 (optional)"),
    ],
    outputs=gr.Image(type="pil", format="png", label="Result"),
    title="Qwen-Image-2.1",
    api_name="edit",
    flagging_mode="never",
)

if __name__ == "__main__":
    demo.queue().launch()
