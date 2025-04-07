import {Request, Response} from "express";
import AiService from "../../services/v1/ai.service";

const aiService = new AiService();

export async function Home(req: Request, res: Response): Promise<void> {
    try {
        // const prompt = await aiService.generatePrompt();
        //
        // if (!prompt) {
        //     res.status(400).json({
        //         status: "error",
        //         message: "Prompt not found",
        //     });
        // }
        //
        // await aiService.generateImage(prompt!);
        //
        // res.status(200).json({
        //     status: "success",
        //     data: [],
        //     message: "Welcome to our API homepage!",
        // });
        return;
    } catch (e) {
        console.error("Ошибка в Home API:", e);

        res.status(500).json({
            status: "error",
            message: e instanceof Error ? e.message : "Internal Server Error",
        });
    }
}
