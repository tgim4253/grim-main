use std::fmt::Display;

pub type CommandResult<T> = Result<T, String>;

pub trait IntoCommandResult<T> {
    fn into_command(self) -> CommandResult<T>;
}

impl<T, E> IntoCommandResult<T> for Result<T, E>
where
    E: Display,
{
    fn into_command(self) -> CommandResult<T> {
        self.map_err(|error| error.to_string())
    }
}
