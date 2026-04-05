import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button as CardButton } from "@/components/ui/CardButton";
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ArrowLeft, ArrowRight, Check, CheckSquare2, CheckSquareIcon, Link, Star, TextAlignCenter } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { ButtonGroup } from "@/components/ui/button-group"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";


export default function DashboardPage() {
  return (
    <div className="w-full  px-6">

        <div className="w-full mb-4">
          <Card className="w-full h-full px-4 py-4">
            <div className="grid grid-cols-2 items-center gap-4">
              <p className="text-lg font-medium text-left">Marketplace</p>

              <div className="flex justify-end">
                <Field className="flex items-center">
                  <ButtonGroup className="space-x-2 pr-2">
                    <Input
                      id="input-button-group"
                      placeholder="Type to search..."
                      className="min-w-[200px]" // optional: ensures input has some width
                    />
                    <Button variant="outline">Search</Button>
                    <Button variant="outline">Create</Button>
                  </ButtonGroup>
                </Field>
              </div>
            </div>
          </Card>
        </div>

      <div className="w-full flex flex-row mt-4 gap-4">

        {/* Filter */}
        <div className="w-100 h-full" >
          <Card className="w-full h-screen">
            <CardHeader>
              <CardTitle>
                Filter  
              </CardTitle>
            </CardHeader>
            <CardContent>
                <FieldGroup className="mx-auto w-56">
                  <Field orientation="horizontal">
                    <Checkbox id="terms-checkbox-basic" name="terms-checkbox-basic" />
                    <FieldLabel htmlFor="terms-checkbox-basic">
                      Relavance
                    </FieldLabel>
                  </Field>
                </FieldGroup>

                <FieldGroup className="mx-auto w-56">
                  <Field orientation="horizontal">
                    <Checkbox id="terms-checkbox-basic" name="terms-checkbox-basic" />
                    <FieldLabel htmlFor="terms-checkbox-basic">
                      Latest
                    </FieldLabel>
                  </Field>
                </FieldGroup> 
                
                <FieldGroup className="mx-auto w-56">
                  <Field orientation="horizontal">
                    <Checkbox id="terms-checkbox-basic" name="terms-checkbox-basic" />
                    <FieldLabel htmlFor="terms-checkbox-basic">
                      Top Sales
                    </FieldLabel>
                  </Field>
                </FieldGroup>
                <FieldGroup className="mx-auto w-56">
                  <Field orientation="horizontal">
                    <Checkbox id="terms-checkbox-basic" name="terms-checkbox-basic" />
                    <FieldLabel htmlFor="terms-checkbox-basic">
                      Freelancers
                    </FieldLabel>
                  </Field>
                </FieldGroup>
                <FieldGroup className="mx-auto w-56">
                  <Field orientation="horizontal">
                    <Checkbox id="terms-checkbox-basic" name="terms-checkbox-basic" />
                    <FieldLabel htmlFor="terms-checkbox-basic">
                      Bid
                    </FieldLabel>
                  </Field>
                </FieldGroup>

              <hr className="mt-4 mb-4 border-gray-300 w-full" />
              <p className="mt-4 mb-4 ">Price Range:</p>
              
               <div className="mt-4 grid grid-cols-3 w-100px gap-1 ">

                  <FieldGroup className="grid max-w-sm grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="first-name">Minimum </FieldLabel>
                      <Input id="minprice" placeholder="0.00" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="last-name">Maximum</FieldLabel>
                      <Input id="maxprice" placeholder="1000" />
                    </Field>
                  </FieldGroup>
               </div>
              
              <hr className="mt-4 mb-4 border-gray-300 w-full" />

              {/* Rating */}
              <p className="mt-10">Rating</p>
              <div className="flex items-center mt-2 mb-2 gap-2">
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#fff100"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#fff100"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#fff100"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#fff100"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#fff100"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <button><ArrowRight/></button>
              </div>

              <div className="flex items-center mt-2 gap-2">
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#fff100"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#fff100"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#fff100"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#fff100"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#ffffff"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <button><ArrowRight/></button>
              </div>

              <div className="flex items-center mt-2 mb-2 gap-2">
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#fff100"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#fff100"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#fff100"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#ffffff"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#ffffff"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <button><ArrowRight/></button>
              </div>
              
              <div className="flex items-center mt-2 mb-2 gap-2">
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#fff100"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#fff100"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#ffffff"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#ffffff"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <svg  xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill={"#ffffff"} viewBox={"2 2 20 20"}><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.99.99 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"></path></svg>
                <button><ArrowRight/></button>
              </div>

              
            </CardContent>
          </Card>
      </div>


        {/* Service Choices */}
        <div className="w-full">
          <Card>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                  <CardButton>
                  <Card className="w-auto text-left">
                    <CardHeader className="flex items-center gap-2">
                        <Avatar>
                          <AvatarImage src="/avatar.png" alt="User Avatar" />
                          <AvatarFallback>A</AvatarFallback>
                        </Avatar>
                      <CardTitle>Arpon</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <br/>                 
                      <img src="/WorkSyncLogo.png" alt="User Avatar" className="w-10 h-10 rounded-md"/>     
                      <br/>                 
                      <p>PHP 2500</p>
                      <p>Video editor</p>
                    </CardContent>
                  </Card>
                </CardButton>

                 <CardButton>
                  <Card className="w-auto text-left">
                    <CardHeader className="flex items-center gap-2">
                        <Avatar>
                          <AvatarImage src="/avatar.png" alt="User Avatar" />
                          <AvatarFallback>A</AvatarFallback>
                        </Avatar>
                      <CardTitle>Arpon</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <br/>                 
                      <img src="/WorkSyncLogo.png" alt="User Avatar" className="w-10 h-10 rounded-md"/>     
                      <br/>                 
                      <p>PHP 2500</p>
                      <p>Video editor</p>
                    </CardContent>
                  </Card>
                </CardButton> 
                
                
                <CardButton>
                  <Card className="w-auto text-left">
                    <CardHeader className="flex items-center gap-2">
                        <Avatar>
                          <AvatarImage src="/avatar.png" alt="User Avatar" />
                          <AvatarFallback>A</AvatarFallback>
                        </Avatar>
                      <CardTitle>Arpon</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <br/>                 
                      <img src="/WorkSyncLogo.png" alt="User Avatar" className="w-10 h-10 rounded-md"/>     
                      <br/>                 
                      <p>PHP 2500</p>
                      <p>Video editor</p>
                    </CardContent>
                  </Card>
                </CardButton> 
                
                <CardButton>
                  <Card className="w-auto text-left">
                    <CardHeader className="flex items-center gap-2">
                        <Avatar>
                          <AvatarImage src="/avatar.png" alt="User Avatar" />
                          <AvatarFallback>A</AvatarFallback>
                        </Avatar>
                      <CardTitle>Arpon</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <br/>                 
                      <img src="/WorkSyncLogo.png" alt="User Avatar" className="w-10 h-10 rounded-md"/>     
                      <br/>                 
                      <p>PHP 2500</p>
                      <p>Video editor</p>
                    </CardContent>
                  </Card>
                </CardButton> 
                
                <CardButton>
                  <Card className="w-auto text-left">
                    <CardHeader className="flex items-center gap-2">
                        <Avatar>
                          <AvatarImage src="/avatar.png" alt="User Avatar" />
                          <AvatarFallback>A</AvatarFallback>
                        </Avatar>
                      <CardTitle>Arpon</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <br/>                 
                      <img src="/WorkSyncLogo.png" alt="User Avatar" className="w-10 h-10 rounded-md"/>     
                      <br/>                 
                      <p>PHP 2500</p>
                      <p>Video editor</p>
                    </CardContent>
                  </Card>
                </CardButton>

            </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>

    

  )
}