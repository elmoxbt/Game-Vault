use anchor_lang::prelude::*;

declare_id!("6wTDjykpx8e2LebgR7shGFaU9Xh57aSZGXmyqgF2ctsG");

#[program]
pub mod gamevault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
